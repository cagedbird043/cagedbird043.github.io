---
title: 在手机上打造随身开发环境：Termux与code-server的完美结合
date: 2024-10-06 04:17:35
tags:
  - Termux
  - Chroot
  - Ubuntu
  - code-server
  - 随身IDE
  - 集成开发环境
  - 移动开发工具
categories: 技术教程
cover: /img/2024/10/6/code-server.png
---

在使用 **Linux Deploy** 配置 Chroot 环境时，我发现虽然它提供了便利，但其长期无人维护的问题逐渐显露出来。可选的 **Linux** 发行版过于老旧，导致一些功能失效，且细节设置也不尽人意。为了解决这些问题，我决定转向 **Termux** 来配置 Chroot 环境。这样一来，我不仅能够使用更新的发行版，还能进行更加精细的设置，从而打造出一个更符合我需求的 **Chroot** 环境。

本文以 **Ubuntu 24.04.1 LTS** 为例，建立了一个安装了 **code-server** 的 Chroot 容器，文末会提供一键启动脚本。

测试机: **Oneplus 9, Android 14**

<!-- more -->

![Code-server](/img/2024/10/6/code-server.png "Code-server")

<p align="center">code-server运行截图</p>

## 1. **硬件要求**

一台 Android 10 及以上系统的手机。

## 2. **系统要求**

1. 手机已刷入[Magisk](https://topjohnwu.github.io/Magisk/)、[KernelSU](https://kernelsu.org/)以及 [Apatch](https://apatch.dev/)中的任何一种。
2. 已安装 **[Termux](https://termux.dev/)**

## 3. **Termux 换源**

**图形界面（TUI）替换**

在较新版的 Termux 中，官方提供了图形界面（TUI）来半自动替换镜像，推荐使用该种方式以规避其他风险。
在 Termux 中执行如下命令

```bash
termux-change-repo
```

在图形界面引导下，使用自带方向键可上下移动。
第一步使用空格选择需要更换的仓库，之后在第二步选择国内镜像源，如清华大学开源镜像站。确认无误后回车，镜像源会自动完成更换。

## 4. **安裝 Ubuntu Chroot 環境**

1. 开启 Termux，并安装**tsu**
   ```bash
   apt update
   apt install tsu
   ```
2. 切换到 su shell
   ```bash
   su
   ```
3. 选择/data/local/tmp 创建 chroot 目录
   ```bash
   mkdir /data/local/tmp/Ubuntu
   cd /data/local/tmp/Ubuntu
   ```
   /data/local/tmp 目录的权限问题最少，故选择此目录
4. 下载 Ubuntu 24.04.1 base 系统的 rootfs 压缩包
   ```bash
   wget https://mirror.tuna.tsinghua.edu.cn/ubuntu-cdimage/ubuntu-base/releases/24.04.1/release/ubuntu-base-24.04.1-base-arm64.tar.gz
   ```
5. 解压并建立/sdcard 的共享点
   ```bash
   tar xpvf ubuntu-base-24.04.1-base-arm64.tar.gz --numeric-owner
   mkdir sdcard
   cd ..
   ```
6. 新建 chroot 启动脚本:

   ```bash
   vi Ubuntu.sh
   ```

   并填入以下内容：

   ```bash
   #!/bin/sh

   # Ubuntu所在目录
   UBUNTUPATH="/data/local/tmp/Ubuntu"

   # 解决setuid问题
   busybox mount -o remount,dev,suid /data

   busybox mount --bind /dev $UBUNTUPATH/dev
   busybox mount --bind /sys $UBUNTUPATH/sys
   busybox mount --bind /proc $UBUNTUPATH/proc
   busybox mount -t devpts devpts $UBUNTUPATH/dev/pts

   # 挂载内部存储空间
   busybox mount --bind /sdcard $UBUNTUPATH/sdcard

   # chroot至Ubuntu
   busybox chroot $UBUNTUPATH /bin/su - root

   # 取消挂载
   busybox umount $UBUNTUPATH/dev/pts
   busybox umount $UBUNTUPATH/dev
   busybox umount $UBUNTUPATH/proc
   busybox umount $UBUNTUPATH/sys
   busybox umount $UBUNTUPATH/sdcard
   ```

7. 授予脚本执行权限
   ```bash
   chmod +x Ubuntu.sh
   ```
8. 进入 chroot
   ```bash
   sh Ubuntu.sh
   ```
9. 设置 dns 和主机名
   ```bash
   # 设置AliDNS
   echo "nameserver 223.5.5.5" > /etc/resolv.conf
   echo "127.0.0.1 localhost" > /etc/hosts
   ```
10. 授予 socket 权限以便 chroot 容器联网
    ```bash
    groupadd -g 3003 aid_inet
    groupadd -g 3004 aid_net_raw
    groupadd -g 1003 aid_graphics
    usermod -g 3003 -G 3003,3004 -a _apt
    usermod -G 3003 -a root
    ```
11. 更新 Ubuntu 软件源和系统并更换镜像源

    ```bash
    cat /dev/null > /etc/apt/sources.list

    touch /etc/apt/sources.list.d/debian.sources

    echo '
    Types: deb
    Types: deb
    URIs: https://mirrors.tuna.tsinghua.edu.cn/ubuntu
    Suites: noble noble-updates noble-backports
    Components: main restricted universe multiverse
    Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg

    Types: deb
    URIs: http://security.ubuntu.com/ubuntu/
    Suites: noble-security
    Components: main restricted universe multiverse
    Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
    ' > /etc/apt/sources.list.d/ubuntu.sources

    apt update&&apt upgrade -y
    apt install vim net-tools sudo git
    ```

12. 新增普通用户及本地化

    ```bash
    # 设定时区为中国上海
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

    # 修改root密码
    passwd root

    # 新增普通用户
    groupadd storage
    groupadd wheel
    useradd -m -g users -G wheel,audio,video,storage,aid_inet -s /bin/bash user
    passwd user

    # 編輯：vim /etc/sudoers，在root ALL=(ALL) ALL的下一行加入以下內容:
    user    ALL=(ALL:ALL) ALL

    # 切换到普通用户
    su user

    # 安装locales并切换为简体中文
    sudo apt install locales
    sudo locale-gen zh_CN.UTF-8
    ```

13. 卸载并禁止 Snap

    卸载 snap

    ```bash
    sudo apt autopurge snapd
    ```

    禁止 snap 安装

    ```bash
    cat <<EOF | sudo tee /etc/apt/preferences.d/nosnap.pref
    # To prevent repository packages from triggering the installation of Snap,
    # this file forbids snapd from being installed by APT.
    # For more information: https://linuxmint-user-guide.readthedocs.io/en/latest/snap.html
    Package: snapd
    Pin: release a=*
    Pin-Priority: -10
    EOF
    ```

14. 设置一键启动脚本

    Termux 有一个好用的插件，叫作 [Termux:Widget](https://f-droid.org/zh_Hant/packages/com.termux.widget/),这个插件可以在桌面创建启动脚本的快捷方式，按如下步骤操作

    1. 退出 chroot 环境

       ```
       exit
       ```

    2. 先安装[Termux:Widget](https://f-droid.org/zh_Hant/packages/com.termux.widget/)

    3. 为 Termux 授权 [显示在其他应用上方] 权限

    4. 编辑 chroot 启动脚本
       ```bash
       sudo vim /data/local/tmp/Ubuntu.sh
       ```
    5. 将 busybox chroot $UBUNTUPATH /bin/su - root 中的 root 改成你的用户名。

    6. 新建快捷方式脚本

       ```bash
       touch ~/.shortcuts/Ubuntu
       chmod +x ~/.shortcuts/Ubuntu
       vim ~/.shortcuts/Ubuntu
       ```

       填入如下内容

       ```bash
       #!/bin/sh
       export ASH_STANDALONE=1

       su -c cmd wifi force-low-latency-mode enabled
       echo "启用Wi-Fi低延迟模式"
       su -c busybox mount --bind $PREFIX/tmp /data/local/tmp/ubuntu/tmp

       su -c "sh /data/local/tmp/startu.sh"
       su -c cmd wifi force-low-latency-mode disabled
       echo "禁用Wi-Fi低延迟模式"
       ```

    7. 回到手机桌面，拖动 Termux:Widget 小部件到桌面

## 5. **安装 code-server**

1. 安装[code-server](https://github.com/coder/code-server)

   进入 chroot，执行如下命令，若 curl 报错请确定自己是否开启了科学上网工具，这里暂不介绍其如何使用

   ```bash
   curl -fsSL https://code-server.dev/install.sh | sh
   ```

2. 先启动 code-server 以自动创建配置文件
   ```bash
   code-server
   ```
3. 配置 code-server 使用微软官方 marketplace

   由于微软的用户政策使得开源版本的 code 都不被允许使用微软官方的插件商城，导致开源版本的 code 只能使用开源的 marketplace，其中很多插件版本过旧，无法使用，因此我在这里附上如何修改内置的 marketplace

   ```bash
   vim ~/.bashrc
   //sudo vim /etc/profile //修改这个文件也可以
   ```

   向文件中插入一行

   ```bash
   export EXTENSIONS_GALLERY = "{"serviceUrl": "https://marketplace.visualstudio.com/_apis/public/gallery","itemUrl": "https://marketplace.visualstudio.com/items"}"
   ```

4. 修改 code-server 监听地址和密码

   ```bash
   vim ~/.config/code-server/config.yaml
   ```

   改为如下内容

   ```
   bind-addr: 0.0.0.0:8080 //0.0.0.0是允许局域网设备访问的ip地址
   auth: none //无密码，不建议为它设置密码，由于使用环境较为安全，密码没有什么意义
   cert: false //无加密，局域网SSL证书过于麻烦
   ```

5. 启动 code-server 并用浏览器访问

   ```bash
   code-server
   ```

   此时可以在本机浏览器测试，输入 localhost:8080 即可

   其他局域网设备则输入 ip:8080

6. (可选)配置 Chrome/Edge 浏览器以完全启用网页端 code-server 功能
   访问 Chrome://flags 或 Edge://flags，并搜索 Insecure origins treated as secure，在下面输入 http://<span></span>ip:8080，此后再访问就不会提示不安全和部分 js 脚本无法正常执行

7. 具体 vscode 的配置过程这里暂时不介绍了

## 6. **安全退出和删除 Chroot 环境**

1.  退出 chroot 环境
    ```bash
    exit
    ```
2.  如何安全删除 chroot 环境
    请务必在 exit 后并确定取消挂载一切 chroot 相关目录后删除 chroot 文件夹，本例中文件夹在/data/local/tmp/Ubuntu，否则可能会导致/sdcard 甚至系统文件被删除，最稳妥的方式是重启后删除，重启后所有挂载都会重置

## 7. **参考资料**

[[Root] 手機 Termux 建立 chroot Ubuntu 環境，免 Linux Deploy · Ivon 的部落格](https://ivonblog.com/posts/termux-chroot-ubuntu/#7-%E8%A8%AD%E5%AE%9A%E4%B8%80%E9%8D%B5%E5%95%9F%E5%8B%95%E6%8C%87%E4%BB%A4%E7%A8%BF)

[code-server](https://github.com/coder/code-server)
