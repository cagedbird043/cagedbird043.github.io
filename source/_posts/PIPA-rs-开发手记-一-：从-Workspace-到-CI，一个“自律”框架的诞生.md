---
title: PIPA-rs 开发手记 (一)：从 Workspace 到 CI，一个“自律”框架的诞生
date: 2025-10-05 17:23:46
tags:
  - Rust
  - 系统编程
  - CI/CD
  - 开源
  - Linux
categories:
  - PIPA-rs 开发手记
---

开新坑了。这次，我想从零开始，用 Rust 认真地做一个原生的 Linux 性能分析工具链——`PIPA-rs`。这不仅是对经典 PIPA 项目的一次重塑，也是我个人在系统编程领域的一次深度探索。

但今天这第一篇，我们不聊 `perf_event_open` 的底层魔法，也不谈 `/proc` 文件系统的精妙。在写下第一行真正的业务逻辑之前，我想先聊聊那些“看不见”的东西：项目的工程化基础。

很多人（包括曾经的我）在开始一个新项目时，总是迫不及待地 `cargo new` 然后一头扎进 `main.rs`。但这次，我决定反其道而行之。我要为 PIPA-rs 搭建一个“世界级”的工程基础。这听起来有点空，甚至有点“过度工程”的嫌疑，但一个可靠的工具，必须诞生于一个可靠的摇篮。这个摇篮，关乎开发纪律、自动化，以及在未来漫长的迭代中，我们是否还能保持从容。

所以，这篇手记，就从我们的第一块基石开始：如何搭建一个“自律”的 Rust 项目框架，以及我们在 CI/CD 自动化之路上，踩过的那些坑和最终找到的光。

<!-- more -->

### 第一块基石：用 Workspace 规划未来，用 `resolver` 购买保险

从一开始，我就很清楚 PIPA-rs 不会是一个单一、庞大的可执行文件。它应该是一套分工明确、松耦合的组件集合。因此，我毫不犹豫地选择了 `Cargo Workspace`。

```toml
# Cargo.toml
[workspace]
resolver = "2"
members = [
    "crates/pipa_cli",
    "crates/pipa_collector",
    "crates/pipa_core",
    "crates/pipa_parser",
    "crates/pipad_server",
]
```

这个 `members` 列表，就是 PIPA-rs 的蓝图：

- `pipa_collector`: 负责从内核收集原始数据的“矿工”。
- `pipa_parser`: 将原始数据解析成结构化信息的“解析器”。
- `pipa_core`: 实现核心分析逻辑的“大脑”。
- `pipa_cli`: 用户与之交互的“命令行界面”。
- `pipad_server`: 用于数据持久化的“数据库服务”。

在项目的第一天就做出这样的划分，好处是显而易见的：它强制我们思考模块间的边界，让每个 `crate` 的职责都保持单一。

而在 `[workspace]` 中，有一行看似微不足道的配置，我却认为它对项目的长期健康至关重要——`resolver = "2"`。

这行代码是为项目的未来“购买的一份保险”。在旧版的 Cargo 解析器 (v1) 中，当依赖关系变得复杂时，可能会为不同的 `crate` 解析出同一个依赖库的不同 `feature` 组合，这在链接时可能导致难以调试的符号冲突。而 V2 解析器会强制在整个工作区内对 `feature` 进行统一，从根本上杜绝了这类问题。对于 PIPA-rs 这样一个注定会引入复杂依赖的项目，这个决策能让我们在未来省去很多挠头的时刻。

### 自动化之路：CI/CD 的“阵痛”与进化

有了骨架，下一步就是注入灵魂——自动化。我立刻着手搭建了基于 GitHub Actions 的 CI/CD 流程。

我的第一个 `ci.yml` 版本非常朴素，就是一个单 `job` 的线性工作流：`checkout -> install -> fmt -> clippy -> test`。然而，现实很快就给我上了一课，CI 管道立刻用一抹红色迎接了我。

**遭遇的连环坑：**

1.  **废弃的 Action**: 我最初使用的 `dtolnay/rust-toolchain-action` 已经被废弃，导致 workflow 直接失败。这是一个典型的经验陷阱，提醒我在选择第三方依赖时，必须关注其维护状态。我迅速迁移到了官方维护的 `actions-rust-lang/setup-rust-toolchain`。
2.  **Cargo 目录约定**: 接下来是一个新手级的错误——`no targets specified`。这暴露了我的项目文件结构与 Cargo 的约定不符。虽然有点尴尬，但这恰好证明了 CI 作为第一道防线的价值：它在我合并一个有结构性缺陷的改动前，就无情地将其拦下。

在解决了这些基础问题后，CI 终于跑通了。我长舒一口气，然后引入了下一个关键组件：`cargo-tarpaulin`，用于代码覆盖率统计。这是我们对代码质量的承诺。

然而，新的“灾难”降临了。一个原本几十秒就能完成的 CI run，时间瞬间飙升到数分钟。

这对我们追求的“原子化提交”工作流是致命的。如果每次微小的提交都要等待几分钟的 CI，开发者的心流会被严重打断。必须优化！

解决方案是缓存。但简单的缓存 `~/.cargo/bin` 并不够精细。`cargo-tarpaulin` 是一个体积较大且不常变动的开发工具，如果把它和其他可能频繁安装的小工具混在同一个缓存里，缓存很容易就失效了。

最终的方案是：**为 `tarpaulin` 建立独立的、带稳定 key 的缓存**。

```yaml
# .github/workflows/ci.yml

- name: Cache cargo-tarpaulin
  id: cache-tarpaulin
  uses: actions/cache@v4
  with:
    path: ~/.cargo/bin/cargo-tarpaulin
    key: ${{ runner.os }}-cargo-tarpaulin-v1 # 一个稳定的 key

- name: Install cargo-tarpaulin if not cached
  # 只有在缓存未命中时，才执行安装
  if: steps.cache-tarpaulin.outputs.cache-hit != 'true'
  run: cargo install cargo-tarpaulin
```

通过这个精细化的缓存策略，`tarpaulin` 的安装步骤在绝大多数情况下都会被跳过，CI 时间也从数分钟降回了令人舒适的几十秒。一次性能阵痛，换来了一劳永逸的优化。

### 纪律的内化：将“质量左移”进行到底

CI 是一个很好的安全网，但它是一个**遥远**的安全网。它的反馈链条是：`写代码 -> commit -> push -> 等待 CI 结果`。如果只是一个格式问题或者一个简单的 clippy 警告，这个等待就太浪费时间了。

我信奉一个原则：“**质量左移 (Shift-Left Quality)**”——越早在开发流程中发现问题，修复的成本就越低。

为了践行这个原则，我引入了 `pre-commit` 钩子。它将 CI 的一部分能力，直接带回了开发者的本地机器。

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/doublify/pre-commit-rust
    rev: v1.0
    hooks:
      - id: fmt
      - id: clippy
        args: ["--all-targets", "--", "-D", "warnings"]
```

现在，每当我 `git commit` 时，`cargo fmt` 和 `cargo clippy` 都会自动在我的暂存文件上运行。任何格式错误或 clippy 警告都会直接阻止这次提交，并提示我修正。反馈几乎是瞬时的。

这个机制很快就展现了它的价值。在我配置 `clippy` 钩子时，就因为一个参数错误导致它无法正常工作。这个问题在本地就被 `pre-commit` 暴露了出来，我甚至不需要 push 代码，就完成了调试和修复，省下了一个完整的 CI 周期。

### 尾声：地基之上，未来可期

至此，PIPA-rs 的地基算是搭建完成了。我们拥有了一个：

- **结构清晰**的 `Cargo Workspace`。
- 一个**快速、可靠**的 CI/CD 流程来自动化质量检查。
- 一套**强制执行纪律**的 `pre-commit` 钩子来提供即时反馈。

这个“自律”的框架，让我在写下第一行业务代码时，充满了信心。我知道，有无数个自动化的守卫在保护着这个项目的代码质量，让我可以更专注于核心功能的实现。

有了这个坚实的地基，我们终于可以开始盖楼了。下一篇手记，我们将正式潜入 `pipa_collector` 的世界，从解析 `/proc/stat` 和 `/proc/meminfo` 开始，真正踏上数据采集的征程。
