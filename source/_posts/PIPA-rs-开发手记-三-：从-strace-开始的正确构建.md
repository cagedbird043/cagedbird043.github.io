---
title: PIPA-rs 开发手记 (三)：从 strace 开始的正确构建
date: 2025-10-05 19:10:11
tags:
  - Rust
  - 系统编程
  - Linux
  - perf_event
  - strace
categories:
  - PIPA-rs 开发手记
---

在上一篇，我们用 `crossterm` 绘制出了一个专业的 TUI 界面。现在，是时候挑战 PIPA-rs 的真正核心了：实现 `pipa-rs stat -- <command>`，一个 `perf stat` 的原生替代品。

这意味着，我们要直面 `perf_event_open` 这个系统调用，去精确测量一个外部命令从生到死的完整生命周期。

前期的探索，虽然没有产生一行可用的代码，但却留下了一份极其宝贵的财富：**一份详尽的“此路不通”的地图。** 它用 `ptrace` 和信号的失败告诉我们，任何试图在用户态通过复杂技巧来模拟内核级同步的方案，都是在与操作系统的底层调度作对，这是一场注定会失败的战争。

所以，这次我们不是在收拾烂摊子。我们怀揣着“排除法得来的宝贵知识”，进行了一次目标明确的、从零开始的正确构建。我们的任务，从“发明创造”，转变成了“**探索发现**”。

<!-- more -->

### 范式转换：从“猜测”到“观察”

既然解决方案必然存在于内核的原生能力之中，而 `perf` 工具已经完美地利用了它，那么问题就变得简单了：我们只需要“窃听” `perf` 与内核的对话。

`strace` 成为了我们手中最锋利的解剖刀。我执行了那个改变一切的命令：

```sh
$ strace -e trace=perf_event_open perf stat -- ls
```

输出的信息虽然嘈杂，但我们的目标很明确。很快，我们就有了一系列颠覆性的发现。

**发现一：关于“事件组”的假设是错误的**

我最初以为，`perf stat` 会创建一个“事件组”来同时监控多个性能事件。但在 `strace` 的输出中，我们看到 `perf` 为每一个事件都进行了一次独立的 `perf_event_open` 调用，并且每一次的 `group_fd` 参数**始终是 `-1`**。

```
perf_event_open({..., config=PERF_COUNT_HW_CPU_CYCLES, ...}, ..., group_fd=-1, ...)
perf_event_open({..., config=PERF_COUNT_HW_INSTRUCTIONS, ...}, ..., group_fd=-1, ...)
```

这个证据无可辩驳地证明：`perf stat` 在这种场景下，根本没有使用事件组。它用的是更简单的东西。

**发现二：内核提供的“全自动”同步魔法**

排除了“组”这个干扰项后，我们的焦点汇聚到了 `perf_event_attr` 结构体内部。在那里，我们看到了三个之前被忽略的、共同协作的标志位：

- `inherit = 1`
- `disabled = 1`
- `enable_on_exec = 1`

那一刻，我豁然开朗。我们之前所有关于 `ptrace` 和 `SIGSTOP` 的挣扎，都是为了在一个精确的时间点“按下秒表”。而这三个标志，相当于我们直接告诉内核：

> “我这里有一堆秒表 (`fd`)，它们现在是关闭的 (`disabled=1`)。请把这些秒表遗传给我的所有孩子 (`inherit=1`)。最关键的是，等到任何一个孩子喊出 `execve` 的那一刻，**由你来替我按下启动按钮** (`enable_on_exec=1`)。”

内核，作为唯一的、全知的系统调度者，是唯一能完美执行这个任务的角色。我们之前所有的努力，都是在尝试用业余的手段，去模拟内核与生俱来的能力。

### 优雅的重生：将 `strace` 日志翻译成 Rust 代码

在掌握了“标准答案”后，`raw_perf_events.rs` 模块的构建思路变得清晰无比：**精确、无损地复制 `perf` 的行为**。

我们彻底废弃了所有与“事件组”相关的复杂逻辑，只设计了一个简单的 `Counter` 结构体。其核心函数 `create_counter_for_command` 的实现，就是对 `strace` 日志的一次忠实“代码翻译”。

```rust
// crates/pipa_collector/src/raw_perf_events.rs

pub fn create_counter_for_command(event: PerfEvent) -> Result<Counter, PipaCollectorError> {
    let mut attrs = sys::bindings::perf_event_attr {
        size: std::mem::size_of::<sys::bindings::perf_event_attr>() as u32,
        ..Default::default()
    };
    // ... 设置 type 和 config ...

    // 这里的每一行设置，都是对 strace 输出的直接复刻。
    // 我们不再有任何猜测，只有对证据的忠实转录。
    attrs.set_disabled(1);
    attrs.set_inherit(1);
    attrs.set_enable_on_exec(1);

    // 参数的选择也完全基于 perf 的行为。
    let fd = unsafe { sys::perf_event_open(&mut attrs, 0, -1, -1, 0) };

    // ... 错误处理和返回 ...
    Ok(Counter { fd })
}
```

这段代码的简洁性，与我们之前在“同步地狱”中构想的复杂方案形成了鲜明对比，这本身就是其正确性的最好证明。

### 点睛之笔：`dup` 与健壮性的最后拼图

在核心功能实现后，我们遇到了最后一个、也是最微妙的一个问题：如何在子进程结束后，安全地从其拥有的 `fd` 中读取数据，同时不破坏我们 `Counter` 结构体的 RAII 保证。

最初尝试的 `mem::forget` 是一个脆弱的魔术，它在错误路径上存在 `double-close` 的隐患。而最终的解决方案 `libc::dup`，则是一个精妙的、最符合 Unix 哲学的正道。

这个方案的原理，可以用一个“**配钥匙**”的比喻来理解：

我们的 `Counter` 结构体持有那把唯一的“原始钥匙”(`fd`)。如果直接把这把钥匙交给一个临时的 `File` 对象去读取，`File` 在被销毁时 (`Drop`) 就会把钥匙也销毁掉，导致我们的 `Counter` 无钥匙可用。

`libc::dup()` 则是我们的“配钥匙机”。我们用它复制一把“临时钥匙”(`dup_fd`) 交给 `File` 去用。`File` 用完后，销毁的是这把临时钥匙。而我们自己口袋里的那把原始钥匙，自始至终，安然无恙。

```rust
// crates/pipa_cli/src/main.rs -> run_stat()

let read_counter = |counter: &raw_perf_events::Counter| -> Result<u64> {
    // 1. 我们不触碰原始 fd，而是创建一个它的“合法副本”。
    let dup_fd = unsafe { libc::dup(counter.fd()) };
    if dup_fd < 0 {
        return Err(io::Error::last_os_error().into());
    }

    // 2. 我们将这个“副本”的所有权，心安理得地交给 `File`。
    let mut file = unsafe { File::from_raw_fd(dup_fd) };
    let mut buf = [0u8; 8];

    // 3. 无论成功还是失败，`file` 离开作用域时，只会 `close(dup_fd)`。
    //    原始的 `counter.fd()` 始终安全。
    file.read_exact(&mut buf)?;

    Ok(u64::from_le_bytes(buf))
};
```

这个方案的采纳，标志着 `stat` 子命令的构建，不仅在功能上是正确的，在健壮性和工程美学上也达到了我们所追求的高度。

这趟从复杂到简约的旅程，让我深刻理解到：**优秀的系统编程，很多时候不是关于如何“操纵”内核，而是关于如何“理解”并“信任”内核。**

至此，`pipa-rs stat` 的核心逻辑终于完成。下一篇，我们将继续沿着 `perf_event` 这条路走下去，探索更复杂的采样模式，为实现 `perf record` 的功能打下基础。
