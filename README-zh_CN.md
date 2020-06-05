# FastRTC - Video Chat

![License: CC-NC](https://img.shields.io/badge/License-CCNC-blue.svg)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?)](https://github.com/prettier/prettier)

# https://fastrtc.wuwei.tech

基于 WebRTC 的视频聊天平台，使用自建的 STUN /TURN 服务器。

## 灵感来自于[Zipcall](https://github.com/ianramzy/decentralized-video-chat)的视频通讯平台.

代码是基于 Zipcall 修改的,ZipCall 是一个很棒的项目，它的 UI 也很令人舒服，我非常喜欢并向大家推荐。

但是出于众所周知的原因，在中国，我们需要通过科学互联网使用 Zipcall。
针对这个问题，我做了一些工作。

在 Zipcall 的基础上,FastRTC 增加了以下特性。

- 支持自建的 STUN /TURN 服务器，去除了对 twilio 的依赖.
- 支持通话加密，连接双方需要知道房间密码才可通话。
- 具有 PWA 特质，可以被安装在屏幕上。
- 白板

我会继续加入新的特性。

## 特性

- 直接的对等连接,确保最低的延迟
- 无需下载，完全基于浏览器
- 屏幕共享
- 画中画
- 文字聊天
- 支持自建的 STUN /TURN 服务器
- 支持使用密码加入通话，确保安全
- 可安装的(PWA)

## 快速开始

- 您将需要安装 Node.js
- 克隆此仓库

```
git clone https://github.com/Wuwei9536/FastRTC.git
cd FastRTC
```

#### 安装依赖

```
yarn
```

#### 启动服务器

```
npm start
```

- 在浏览器中打开 `localhost:3000`
- 如果要在另一台计算机/网络上使用客户端，请确保在 HTTPS 连接上发布服务。

## 注意

你需要在 server.js 中添加你自己的 STUN/TURN 服务器信息

## 贡献

欢迎 PR

## STUN /TURN

也许你需要 [coturn](https://github.com/coturn/coturn)

## Zipcall's 主页

[Zipcall](https://github.com/ianramzy/decentralized-video-chat)
