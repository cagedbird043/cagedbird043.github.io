---
title: 告别求人：一种FCM推送的终极自测方案
tags:
  - Android
  - Root
  - FCM
  - Telegram
  - KernelSU
  - 自动化
categories:
  - - 技术实践
  - - 开发运维
  - - 开发环境
  - - 移动端
date: 2025-12-07 19:45:15
---

## 背景

在 Root 或使用各类后台管理工具（如墓碑、NoActive 等）后，验证 FCM 推送是否正常工作是一个常见痛点。传统方法依赖他人发送消息，效率低下且不确定。本文提供一种利用 Telegram Bot API 实现的、完全自主的 FCM 推送测试方案。

该方案旨在模拟 App 进程被杀或进入后台限制后，依赖 FCM 唤醒并接收消息的场景。

<!-- more -->

## 核心原理

通过创建一个私有的 Telegram Bot，我们可以利用其 HTTP API，从任何设备（电脑、甚至手机自身）向该 Bot 发送指令，让其给我们的个人账号发送消息。这个过程会通过 Google 的 FCM 服务器，从而可以精准地测试我们手机的 FCM 推送链路是否通畅。

## 准备工作

整个准备过程耗时约 2 分钟，需要一个 Telegram 账号。

### 1. 创建 Bot 并获取 Token

- 在 Telegram 中搜索官方账号 **`@BotFather`** 并开始对话。
- 发送 `/newbot` 命令。
- 按照指引，依次设置 Bot 的昵称和用户名（用户名必须以 `bot` 结尾）。
- 创建成功后，`@BotFather` 会返回一段包含 **API Token** 的消息。复制并保存这串 Token。

{% asset_img Screenshot_2025-12-07-19-56-38-72_948cd9899890cbd5c2798760b2b95377.jpg %}

### 2. 获取个人 Chat ID

- 在 Telegram 中搜索 **`@userinfobot`**。
- 开始对话后，它会自动返回你的个人信息，复制其中的 `Id:` (纯数字)。

### 3. 与你的 Bot 建立连接

- 在 Telegram 中搜索你刚刚创建的 Bot 的用户名。
- 进入聊天窗口，发送任意一条消息（如 "init"）。此步骤是为了让 Bot 能主动向你发送消息。

## 测试流程

### 方法一：使用浏览器

1.  **构造请求 URL**:
    将你的 Token 和 Chat ID 填入以下格式的 URL 中：

    ```
    https://api.telegram.org/bot<你的Bot_Token>/sendMessage?chat_id=<你的Chat_ID>&text=FCM_Test_Message
    ```

2.  **执行测试**:
    - 在手机上，划掉 Telegram 后台，锁屏静置。
    - 在电脑或手机的浏览器中，访问你构造好的 URL。
    - 观察手机是否能在短时间内收到来自 Bot 的通知。

{% asset_img Screenshot_2025-12-07-20-25-04-06.jpg %}

### 方法二：使用 curl (Termux/Linux)

对于开发者，使用 `curl` 命令更高效。

1.  **准备测试脚本**:
    可以创建一个简单的 shell 脚本 `fcm_test.sh`，方便后续使用。

    ```
    #!/bin/bash

    TOKEN="你的Bot_Token"
    CHAT_ID="你的Chat_ID"
    MESSAGE="FCM Test via curl at $(date +'%H:%M:%S')"

    # URL Encode the message
    ENCODED_MESSAGE=$(printf '%s' "$MESSAGE" | jq -sRr @uri)

    curl -s -X POST "https://api.telegram.org/bot$TOKEN/sendMessage" \
         -d chat_id="$CHAT_ID" \
         -d text="$ENCODED_MESSAGE"
    ```

    _注：为确保消息内容正确传递，建议对文本进行 URL 编码。以上脚本使用了 `jq` 进行编码，你也可以使用其他工具。_

2.  **执行测试**:
    - 确保 Telegram 已被划掉后台并锁屏或者被墓碑冻结。
    - 在 Termux 或任何 Linux 终端中，执行该脚本。
    - 观察推送通知。

## 结语

此方案提供了一个独立、可靠、可自动化的 FCM 推送验证方法，尤其适用于在使用各类后台管理工具后，需要排查推送问题的场景。通过该方法，可以明确问题是出在 FCM 推送链路本身，还是 App 自身的保活或通知设置上。
