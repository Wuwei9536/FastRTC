# FastRTC - Video Chat

![License: CC-NC](https://img.shields.io/badge/License-CCNC-blue.svg)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?)](https://github.com/prettier/prettier)

[简体中文](./README-zh_CN.md)

# https://fastrtc.wuwei.tech

Video chat platform powered by WebRTC using self-built STUN/TURN infrastructure.

## A Video Chat inspired by ianramzy's [Zipcall](https://github.com/ianramzy/decentralized-video-chat).

The code is modified based on Zipcall.ZipCall is a great project, and its UI is also comfortable.I like it very much and recommend it.
Based on Zipcall, FastRTC supports self-built STUN /TURN server, which strips out the dependency on twilio, and supports call encryption, so that both parties to the connection need to know the room password to talk.
I will continue to add new features

## Features

- Direct peer to peer connection ensures lowest latency
- No download required, entirely browser based
- Screen sharing
- Picture in picture
- Text chat
- support self-built STUN/TURN
- use password to join call

## Quick start

- You will need to have Node.js installed, this project has been tested with Node version 10.X and 12.X
- Clone this repo

```
git clone https://github.com/Wuwei9536/FastRTC.git
cd FastRTC
```

#### Install dependencies

```
yarn
```

#### Start the server

```
npm start
```

- Open `localhost:3000` in browser
- If you want to use a client on another computer/network, make sure you publish your server on an HTTPS connection.

## Contributing

Pull Requests are welcome!

## Zipcall's homepage

[Zipcall](https://github.com/ianramzy/decentralized-video-chat)
