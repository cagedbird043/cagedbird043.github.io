---
title: 利用termux实现免root的code-server
date: 2024-10-15 16:29:22
tags:
  - Termux
  - code-server
  - 随身IDE
  - 集成开发环境
  - 移动开发工具
categories: 技术教程
cover: /img/2024/10/15/code-server-nonroot.png
---

很多小伙伴由于各种原因无法在自己的安卓设备上获取 root 权限，从而无法配置 chroot 容器，不过，虽然没有 chroot 环境，但我们仍然可以配置一个 code-server,以下是配置过程。

测试机: **华为 matepad 11.5s 灵动版, Android 12**

<!-- more -->

![Code-server](/img/2024/10/6/code-server.png "Code-server")

<p align="center">code-server运行截图</p>

## 1. **硬件要求**

一台 Android 10 及以上系统的手机。

## 2. **系统要求**

已安装 **[Termux](https://termux.dev/)**

## 3. **Termux 换源**

**图形界面（TUI）替换**

在较新版的 Termux 中，官方提供了图形界面（TUI）来半自动替换镜像，推荐使用该种方式以规避其他风险。
在 Termux 中执行如下命令

```bash
termux-change-repo
apt update&&apt upgrade
```

在图形界面引导下，使用自带方向键可上下移动。
第一步使用空格选择需要更换的仓库，之后在第二步选择国内镜像源，如清华大学开源镜像站。确认无误后回车，镜像源会自动完成更换。

## 4. **安装 Node.js**

```bash
apt install -y \
  build-essential \
  binutils \
  pkg-config \
  python3 \
  nodejs-lts
```

## 5. **安装 code-server**

配置 android_ndk_path

```bash
vim ~/../usr/etc/bash.bashrc
```

加入一行如下内容并保存

```bash
export GYP_DEFINES="android_ndk_path=''"

export NODE_OPTIONS="--require /data/data/com.termux/files/home/android-as-linux.js"

export EXTENSIONS_GALLERY='{"serviceUrl": "https://marketplace.visualstudio.com/_apis/public/gallery","itemUrl": "https://marketplace.visualstudio.com/items"}'

```

第一个环境变量是为了顺利通过 code-server 的编译

第二个则是将 termux 伪装成 Linux

第三个是替换 code-server 的 marketplace 为微软官方 marketplace

创建 android-as-linux.js

```bash
touch ~/android-as-linux.js
vim ~/android-as-linux.js
```

输入如下内容并保存

```js
// android-as-linux.js
Object.defineProperty(process, "platform", {
  get() {
    return "linux";
  },
});
```

应用环境变量

```bash
source ~/../usr/etc/bash.bashrc
```

安装[code-server](https://github.com/coder/code-server)

注意 ⚠️:此操作可能需要梯子 🪜，请自备

```bash
npm install --global code-server
```

## 6.**配置 code-server**

1.  先启动 code-server 以自动创建配置文件
    ```bash
    code-server
    ```
2.  修改 code-server 监听地址和密码

    ```bash
    vim ~/.config/code-server/config.yaml
    ```

    改为如下内容

    ```
    bind-addr: 0.0.0.0:8080 //0.0.0.0是允许局域网设备访问的ip地址
    auth: none //无密码，不建议为它设置密码，由于使用环境较为安全，密码没有什么意义
    cert: false //无加密，局域网SSL证书过于麻烦
    ```

3.  启动 code-server 并用浏览器访问

    ```bash
    code-server
    ```

    此时可以在本机浏览器测试，输入 localhost:8080 即可

    其他局域网设备则输入 ip:8080

4.  (可选)配置 Chrome/Edge 浏览器以完全启用网页端 code-server 功能
    访问 Chrome://flags 或 Edge://flags，并搜索 Insecure origins treated as secure，在下面输入 http://<span></span>ip:8080，此后再访问就不会提示不安全和部分 js 脚本无法正常执行

5.  具体 vscode 的配置过程这里暂时不介绍了

## 7.**设置一键启动脚本**

Termux 有一个好用的插件，叫作 [Termux:Widget](https://f-droid.org/zh_Hant/packages/com.termux.widget/),这个插件可以在桌面创建启动脚本的快捷方式，按如下步骤操作

1.  先安装[Termux:Widget](https://f-droid.org/zh_Hant/packages/com.termux.widget/)
2.  为 Termux 授权 [显示在其他应用上方] 权限
3.  编辑启动脚本
    ```bash
    sudo vim /data/local/tmp/Code-Server
    ```
4.  将 busybox chroot $UBUNTUPATH /bin/su - root 中的 root 改成你的用户名。
5.  新建快捷方式脚本
    ```bash
    touch ~/.shortcuts/Code-Server
    chmod +x ~/.shortcuts/Code-Server
    vim ~/.shortcuts/Code-Server
    ```
    填入如下内容
    ```bash
    code-server
    ```
6.  修复 shebang 以便 termux:widget 能够识别
    ```bash
    termux-fix-shebang ~/bin/code-server
    ```
7.  回到手机桌面，拖动 Termux:Widget 小部件到桌面

## 8. **参考资料**

[code-server](https://github.com/coder/code-server)

[termux 使用 npm 拉取出现 gyp: Undefined variable android_ndk_path in binding.gyp while trying to load binding.gyp](https://www.cnblogs.com/mcayear/p/18407607)
