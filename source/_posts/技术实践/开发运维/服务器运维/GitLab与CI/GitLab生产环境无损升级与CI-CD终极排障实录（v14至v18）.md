---
title: GitLab生产环境无损升级与CI/CD终极排障实录（v14至v18）
tags:
  - GitLab
  - CI/CD
  - DevOps
  - SRE
  - Docker Compose
  - PostgreSQL
categories:
  - - 技术实践
  - - 开发运维
  - - 服务器运维
  - - GitLab与CI
date: 2025-11-30 16:37:41
---

# 实战：GitLab 从 v14 到 v18 的跨版本无损升级与 CI/CD 终极排障

## 1. 背景：偿还四年技术债

本文记录了将一台生产环境 GitLab 社区版 (CE) 从 `v14.6.1` (2021 年) 跨越 4 个大版本，无损升级至最新稳定版 **`v18.5.0` 极狐版 (JiHu)** 的全流程。本次升级旨在解决旧版本安全漏洞、利用新版效能分析工具进行工作量量化，并实现架构现代化 (IaC)。

**核心挑战：**

1.  **数据库复杂迁移**：需执行两次数据库引擎大版本升级（PostgreSQL 12 -> 13 -> 16）。
2.  **网络协议冲突**：解决 Docker Compose 内部网络与外部 Nginx 反向代理之间的 HTTPS/HTTP 协议冲突。
3.  **Runner 兼容性**：修复 GitLab 18 对旧 Runner 注册信息及 `session_server` 的底层 Bug。

<!-- more -->

## 2. 策略：本地预演 + IaC 交付

为避免生产环境宕机，我们采用“生产环境备份 -> 本地高性能节点预演 -> 最终 IaC 交付”的策略。所有复杂迁移均在 **AMD 7840H + 64G RAM** 的本地环境中完成。

### 阶梯式升级路径（安全断点）

严格遵循 GitLab 官方升级路径，在每个版本间确保所有数据库后台迁移（Batched Migrations）归零。

- **v14.x**: `14.6.1` → `14.9.5` → `14.10.5`
- **v15.x**: `15.0.5` (PG 13 升级) → `15.4.6` → `15.11.13`
- **v16.x**: `16.0.8` → `16.3.6` → `16.7.7` → `16.11.10`
- **v17.x**: `17.3.5` → `17.5.5` → `17.8.7` → `17.11.7`
- **v18.x**: `18.0.6` (PG 16 升级) → `18.2.6` → `18.4.5`

## 3. 故障排除与终极修复

### 3.1 僵尸 Job 与数据库结构冲突

- **现象**: v18.0.6 升级时出现 `409 Conflict` 或长时间卡在 `status=1` (Active)。
- **分析**: 容器重启导致 Runner Token 状态与数据库记录不一致，或由 `ci_runners.token` 列删除引起。
- **解决**: 使用 Rails Console 强制销毁旧的 Runner 记录，并重新注册。

### 3.2 CI Runner 网络风暴：从 HTTP 妥协到 HTTPS 征服

这是最关键的 CI 故障，由 Docker Compose 内部 DNS 污染导致。

**最终 `docker-compose.yml` 配置 (SRE 级分离):**

```yaml
services:
  gitlab:
    # ...
  gitlab-runner:
    # ...
    # 强制 Runner 容器使用公网 DNS，绕过 Docker 内部解析
    # 让 Runner 像外部用户一样通过 Nginx 反代访问 GitLab
    extra_hosts:
      - "gitlab.xxxtune.tech:47.111.69.239"
```

通过 `extra_hosts` 精准打击，我们**无需妥协于 HTTP**，实现了 Runner 和 Job 容器全程通过 **HTTPS** 与 GitLab 通信，保证了架构的纯粹与安全。

### 3.3 Runner 启动假死 Bug 修复

- **问题**: Runner 容器重启后在 30 秒内崩溃，日志空白（排除 OOM）。
- **分析**: 定位到 GitLab Runner `v18.6.x` 的一个[已知 Bug](https://gitlab.com/gitlab-org/gitlab-runner/-/issues/4360)，`session_server` 启动冲突导致。
- **解决**: 在 `config.toml` 中，将 `[session_server]` 段落注释掉。

## 4. 架构交付：Docker Compose (IaC)

将所有配置固化到 `docker-compose.yml` 中，实现了 GitLab 和 Runner 的统一管理，锁定了稳定版本 `18.5.0-jh.0`。

```yaml
# /srv/gitlab/docker-compose.yml
version: "3.8"

services:
  gitlab:
    # 锁定 GitLab 稳定版本
    image: registry.gitlab.cn/omnibus/gitlab-jh:18.5.0
    container_name: gitlab
    restart: always
    hostname: "gitlab.xxxtune.tech"
    shm_size: "1g"

    ports:
      # HTTP: 仅监听本地，供外部 Nginx 反代
      - "127.0.0.1:8080:80"
      - "2222:22"

    volumes:
      - /srv/gitlab/config:/etc/gitlab
      - /srv/gitlab/logs:/var/log/gitlab
      - /srv/gitlab/data:/var/opt/gitlab

    environment:
      GITLAB_OMNIBUS_CONFIG: |
        external_url 'https://gitlab.xxxtune.tech'
        gitlab_rails['gitlab_shell_ssh_port'] = 2222

        # SSL 在外部 Nginx 终结，内部只监听 HTTP
        nginx['listen_port'] = 80
        nginx['listen_https'] = false
        nginx['proxy_set_headers'] = {
          "X-Forwarded-Proto" => "https",
          "X-Forwarded-Ssl" => "on"
        }
        gitlab_rails['time_zone'] = 'Asia/Shanghai'

  gitlab-runner:
    # 锁定 Runner 最新版本
    image: gitlab/gitlab-runner:v18.6.3
    container_name: gitlab-runner
    restart: always

    # 强制 Runner 使用公网 DNS 访问 GitLab
    extra_hosts:
      - "gitlab.xxxtune.tech:47.111.xxx.xxx"

    volumes:
      - /srv/gitlab-runner/config:/etc/gitlab-runner
      - /var/run/docker.sock:/var/run/docker.sock

    depends_on:
      - gitlab
```

## 5. 总结与成果

经过此次升级，GitLab 成功实现现代化，消除了所有安全隐患，并提供了精确的 **贡献度分析** 和 **CI 效能** 数据。项目现已达到企业级运维标准，并为未来扩展云原生开发环境（如 GitLab Workspaces）打下了坚实基础。
