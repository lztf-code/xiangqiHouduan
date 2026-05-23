# 象棋游戏 - Chess Games ♟️

一个支持中国象棋和国际象棋的在线对战平台！（完全免费部署！）

## 在线演示

- 前端：https://chess-games-liard.vercel.app

## 快速部署（完全免费！）

### 1. 部署后端到 Render（免费！）

1. 访问 https://render.com 并登录 GitHub
2. 点击 **"New +"** → **"Web Service"**
3. 选择此仓库
4. 配置（**全部免费！**）：
   - **Name**: `chess-games-server`
   - **Root Directory**: `chess-games/server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: **Free**（完全免费！）
5. 点击 **"Create Web Service"**

### 2. 配置前端（免费！）

1. 在 Vercel 项目中添加环境变量：
   - `VITE_SERVER_URL` = 您的 Render 后端 URL

### 3. 完成！

重新部署前端，就可以开始游戏了！

## 本地开发

```bash
# 安装依赖
npm install

# 前端开发
npm run dev

# 后端开发
cd server
npm install
npm run dev
```

## 项目结构

```
chess-games/
├── src/              # 前端 React 代码
├── server/           # 后端 Node.js 代码
├── public/           # 静态资源
└── dist/             # 构建产物
```

## 技术栈

- 前端：React + TypeScript + Vite
- 后端：Node.js + Express + Socket.IO
- 部署：Vercel (前端) + Render (后端)
