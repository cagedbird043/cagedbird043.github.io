---
title: 我的程序为什么慢？—— Perf CPU 性能剖析
tags:
  - Linux
  - 性能分析
  - 系统编程
  - 开源工具
  - Linux Perf
  - perf
categories:
  - - 技术实践
  - - 系统工程
  - - 性能工程
  - - Linux性能分析
date: 2025-09-17 14:57:27
---

`本次环境为Arch Linux，内核版本6.12.46-3-cachyos-lts，perf版本6.16-3`

### 前言：为什么 `perf` 让人望而生畏？

`perf` 是 Linux 世界中无可争议的性能分析神器。然而，很多开发者（包括曾经的我）在第一次看到 `perf stat` 那满屏飞舞的专业术语时，都会感到一丝困惑和畏惧：`task-clock`, `IPC`, `stalled-cycles-frontend`... 这些到底意味着什么？

<!-- more -->

死记硬背概念是低效的。学习 `perf` 最好的方法，就是亲手创造一个实验环境，通过对比和分析，让这些冰冷的数据“开口说话”。

本文将带你通过一个极其简单却又经典的案例——实现我们自己的 `ls` 命令——来揭开 `perf` 的神秘面紗。

`本次环境为Arch Linux，内核版本6.12.46-3-cachyos-lts，perf版本6.16-3`

### 第一步：我们的“实验室” - 一个极简的 `ls`

`ls` 命令的核心逻辑是什么？其实非常简单：

1.  打开一个目录。
2.  循环读取目录里的每一个条目。
3.  （可选）获取每个条目的详细信息（元数据）。
4.  打印出来。

这个过程主要涉及文件 I/O 和系统调用（syscalls），使其成为一个绝佳的性能分析对象。下面是我们的极简实现 `ls-mini.c`，它模拟了 `ls -l` 的核心行为：

```c
#include <stdio.h>
#include <dirent.h>     // 主要头文件，包含了 opendir, readdir, closedir
#include <sys/stat.h>   // 包含了 stat 结构体和函数
#include <string.h>
#include <errno.h>

void list_dir(const char *path) {
    DIR *dir_p;                 // 目录流指针
    struct dirent *dir_entry;   // 目录条目结构体指针
    struct stat file_stat;      // 文件元数据结构体

    // 1. 打开目录 (对应 syscall: opendir)
    // 这会返回一个指向目录流的指针，后续可以从中读取条目
    dir_p = opendir(path);
    if (dir_p == NULL) {
        perror("opendir failed");
        return;
    }

    // 2. 循环读取目录中的每一个条目 (对应 syscall: readdir)
    // readdir() 每次被调用，就会返回目录中的下一个条目。当没有更多条目时，返回 NULL。
    while ((dir_entry = readdir(dir_p)) != NULL) {

        // dir_entry->d_name 是我们得到的文件名
        char *filename = dir_entry->d_name;

        // 简单的过滤，跳过 "." 和 ".."
        if (strcmp(filename, ".") == 0 || strcmp(filename, "..") == 0) {
            continue;
        }

        // 3. 获取每个文件的元数据 (对应 syscall: stat/lstat)
        // 为了获取详细信息（像 ls -l 那样），我们需要对每个文件调用 stat。
        // 注意：实际应用中需要拼接完整路径，这里为简化省略了。
        if (stat(filename, &file_stat) == -1) {
            // 如果获取失败，打印错误并跳过
            perror("stat failed");
            continue;
        }

        // 4. 打印（解析和格式化）
        // 这里只是一个极其简单的打印，真实的 ls 会做复杂的格式化
        printf("%lld ", (long long)file_stat.st_size); // 文件大小
        printf("%s\n", filename);                      // 文件名
    }

    // 5. 关闭目录 (对应 syscall: closedir)
    // 操作完成后，释放资源
    closedir(dir_p);
}

int main(int argc, char *argv[]) {
    // 默认列出当前目录 "."
    list_dir(".");
    return 0;
}
```

我们使用 GCC 的 `-O3` 优化来编译它，尽可能压榨它的性能：

```zsh
gcc -O3 -o ls-mini ls-mini.c
```

### 第二步：收集证据 - `perf stat` 登场

现在，我们的主角和参照物都准备好了：`ls-mini` 和系统自带的 `ls`。实验开始！
**对我们自制的 `ls-mini`：**

```zsh
perf stat ./ls-mini
 Performance counter stats for './ls-mini':

              2.22 msec task-clock:u                     #    0.614 CPUs utilized
                 0      context-switches:u               #    0.000 /sec
                 0      cpu-migrations:u                 #    0.000 /sec
               137      page-faults:u                    #   61.827 K/sec
         2,216,772      instructions:u                   #    0.68  insn per cycle
                                                  #    0.30  stalled cycles per insn
         3,245,146      cycles:u                         #    1.465 GHz
           662,811      stalled-cycles-frontend:u        #   20.42% frontend cycles idle
           402,383      branches:u                       #  181.593 M/sec
            13,335      branch-misses:u                  #    3.31% of all branches

       0.003608686 seconds time elapsed

       0.001027000 seconds user
       0.002025000 seconds sys
```

**对系统自带的 `ls`：**

```zsh
perf stat ls

Performance counter stats for 'ls':

              0.85 msec task-clock:u                     #    0.487 CPUs utilized
                 0      context-switches:u               #    0.000 /sec
                 0      cpu-migrations:u                 #    0.000 /sec
                84      page-faults:u                    #   98.831 K/sec
           724,184      instructions:u                   #    0.69  insn per cycle
                                                  #    0.61  stalled cycles per insn
         1,042,864      cycles:u                         #    1.227 GHz
           439,742      stalled-cycles-frontend:u        #   42.17% frontend cycles idle
           146,350      branches:u                       #  172.190 M/sec
             5,834      branch-misses:u                  #    3.99% of all branches

       0.001745312 seconds time elapsed

       0.000000000 seconds user
       0.001757000 seconds sys

```

### 第三步：案件分析 - 解读数据的“微表情”

数据已经到手，现在是侦探时间。让我们逐一对比关键指标，看看它们背后隐藏了什么故事。

#### **故事主线：用户(User)时间 vs. 内核(Sys)时间**

- `ls-mini`: `user` (1.027ms) ≈ `sys` (2.025ms)
- `ls`: `user` (0.00ms, 可忽略) << `sys` (1.757ms)

**结论**：两个程序都是“系统调用密集型”的。它们的绝大部分工作都交给了内核去完成（读取目录和文件元数据）。ls 甚至将用户态的 CPU 时间压缩到了极致，体现了它作为一个成熟工具的高度优化。我们的 ls-mini 虽然用户态耗时也很短，但内核态耗时是用户态的两倍，这同样清晰地表明，程序的瓶颈在于与内核的交互，而非用户态的计算

#### **核心指标 1：IPC (每周期指令数) - CPU 的效率**

- `ls-mini`: **0.68** insn per cycle
- `ls`: **0.69** insn per cycle

**分析**：惊人的一致性！我们自己写的简单代码，在开启 -O3 优化后，CPU 核心的计算效率竟然和官方 ls 几乎完全一样。这说明现代编译器非常智能。

#### **核心指标 2：分支预测 (Branch-Misses) - 代码的“可预测性”**

- `ls-mini`: **3.31%** of all branches
- `ls`: **3.99%** of all branches

**分析**：现代 CPU 为了提速，会猜测 `if-else` 会走哪个分支并提前执行。如果猜错，代价巨大。这里的错误率非常接近，`ls-mini` 略有优势。为什么？因为我们的代码逻辑是“一本道”，几乎没有分支。而 `ls` 内部充满了对各种命令行参数（`-a`, `-l`, `-t`...）的检查，这些 `if` 判断会给分支预测器带来更多挑战。

#### **核心指标 3：(指令缓存效率)前端停滞 (Frontend Cycles Idle) - 指令“塞车”了吗？**

- `ls-mini`: **20.42%** frontend cycles idle
- `ls`: **42.17%** frontend cycles idle

**分析**：既然 CPU 效率一样，性能瓶颈在哪？答案就在这里！官方 ls 因为代码量大、逻辑复杂，其指令缓存命中率远低于我们的小程序，导致 CPU 前端有超过 40% 的时间在空等指令，是 ls-mini 的两倍！这完美展示了代码体积和复杂度对缓存性能的直接影响。

#### **核心指标 4: 指令数 (Instructions)**

- `ls-mini`: 2,216,772 instructions
- `ls`: 724,184 instructions

**分析**：`ls-mini` 执行的指令数几乎是 `ls` 的三倍。既然我们已经知道两者的核心 CPU 效率(IPC)几乎相同，那么这多出来的指令数就直接转化为了更长的执行时间。这些多出来的“工作量”从何而来？

很有可能有以下两个原因：

> 1.  **库函数效率**：我们天真地使用了 `printf` 函数。`printf` 为了处理各种复杂的格式化场景，其内部实现可能相当复杂，执行了大量指令。而 `ls` 作为性能攸关的核心工具，其输出部分几乎肯定是经过特殊优化的，可能直接通过 `write` 系统调用，避免了 `printf` 的额外开销。
> 2.  **系统调用策略**：我们的代码每次循环都调用 `readdir` 和 `stat`。而 `ls` 可能会使用更高级的系统调用（如 `getdents64`），一次性从内核读取多个目录项到用户空间的缓冲区，从而大大减少了循环次数和用户态/内核态的切换开销。

### 结论：我们学到了什么？

通过这个从零到一的简单实验，我们不仅用代码复现了 `ls` 的核心原理，更重要的是让 `perf` 的数据变得生动起来：

1.  **学会了诊断程序类型**：通过对比 `user` 和 `sys` 时间，我们能迅速判断一个程序是 **I/O 密集型** 还是 **计算密集型**，这是性能优化的第一步。
2.  **见证了代码复杂度的代价**：`ls-mini` 的简洁让它在**指令缓存**上表现出色（前端停滞率极低），而 `ls` 庞大的功能集则不可避免地付出了缓存性能的代价。这告诉我们，在高性能场景下，保持核心代码的**小而美**至关重要。
3.  **理解了不同层面的性能**：IPC 和分支预测揭示了 **CPU 微架构层面** 的效率；而指令数则反映了**算法和工程实现层面**的优劣。一个完整的性能画像需要兼顾两者。

`perf stat` 就像是医生用的听诊器，它让我们能对程序的“健康状况”有一个快速而全面的了解。但如果我们要进行“外科手术”，精确定位到是哪个函数出了问题，就需要更强大的工具。

**在下一篇文章中，我们将学习如何使用 `perf record` 和火焰图，来精确找到拖慢我们程序的“罪魁祸首”。敬请期待！**

### 一个插曲：没去掉调试符号，公平吗？

这是一个很好的问题。`gcc` 默认会包含调试符号，这会增大可执行文件的大小。我们可以用 `strip ls-mini` 命令去掉它们。

**这会影响公平性吗？**

- **对于核心运行时性能指标（如 IPC、分支预测），影响微乎其微。** 因为这些指标衡量的是 CPU 执行代码时的行为，与文件里是否包含调试元数据无关。
- **它会影响什么？** 主要影响**启动时间**和**`page-faults`**。一个更大的文件需要从磁盘加载更多的页到内存，`page-faults` 可能会略高。在我们的例子中，`ls-mini` 的 `page-faults` (137) 确实比 `ls` (84) 多，部分原因可能就在于此。

所以，对于我们这次的分析，这个对比**足够公平**，因为它恰好突出了代码大小和复杂度对缓存性能的巨大影响。
