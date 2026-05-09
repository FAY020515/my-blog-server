# 我的博客后端服务

## 🌐 API 接口

### 用户相关

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/register` | POST | 用户注册 |
| `/api/login` | POST | 用户登录 |
| `/api/me` | GET | 获取当前用户信息（需登录） |

### 留言相关

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/messages` | GET | 获取所有留言 |
| `/api/messages` | POST | 发表留言（需登录） |
| `/api/messages/:id` | DELETE | 删除留言（需登录） |

## 🚀 部署到 Vercel

1. 将此项目上传到 GitHub
2. 在 Vercel 中导入项目
3. 设置环境变量 `JWT_SECRET`
4. 部署完成！

## 📝 本地开发

```bash
npm install
npm start
```

服务器将在 http://localhost:3000 启动
