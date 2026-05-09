/**
 * 博客后端服务器
 * 
 * 功能：
 * 1. 用户注册和登录
 * 2. 留言板的增删查
 * 
 * 技术栈：Node.js + Express + SQLite
 */

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

// ========== 配置 ==========
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'my-blog-secret-key-2024';

// ========== 中间件 ==========
// 允许跨域请求（让前端可以访问后端）
app.use(cors());
// 解析 JSON 格式的请求体
app.use(express.json());

// ========== 数据库初始化 ==========
// SQLite 数据库文件会自动创建
const db = new Database(path.join(__dirname, 'blog.db'));

// 创建用户表
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        nickname TEXT,
        avatar_color TEXT DEFAULT '#6c5ce7',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// 创建留言表
db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);

console.log('✅ 数据库初始化完成');

// ========== 工具函数 ==========

/**
 * 生成 JWT 令牌
 * 令牌里包含用户 ID，有效期 7 天
 */
function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * 验证 JWT 令牌的中间件
 * 从请求头获取令牌，验证后把用户信息附加到 req.user
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: '请先登录' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: '登录已过期，请重新登录' });
    }
}

// ========== API 路由 ==========

// 健康检查 - 测试服务器是否运行
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: '服务器运行正常' });
});

// ========== 用户相关 API ==========

/**
 * 用户注册
 * POST /api/register
 * 请求体: { username, password, nickname }
 */
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, nickname } = req.body;
        
        // 验证必填字段
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码不能为空' });
        }
        
        // 验证用户名长度
        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: '用户名长度需要在 3-20 个字符之间' });
        }
        
        // 验证密码长度
        if (password.length < 6) {
            return res.status(400).json({ error: '密码长度至少 6 个字符' });
        }
        
        // 检查用户名是否已存在
        const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existingUser) {
            return res.status(400).json({ error: '用户名已被使用' });
        }
        
        // 密码加密（bcrypt 会自动加盐）
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 随机头像颜色
        const colors = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#e84393', '#fdcb6e'];
        const avatarColor = colors[Math.floor(Math.random() * colors.length)];
        
        // 插入数据库
        const result = db.prepare(
            'INSERT INTO users (username, password, nickname, avatar_color) VALUES (?, ?, ?, ?)'
        ).run(username, hashedPassword, nickname || username, avatarColor);
        
        // 生成令牌
        const token = generateToken(result.lastInsertRowid);
        
        res.status(201).json({
            message: '注册成功',
            token,
            user: {
                id: result.lastInsertRowid,
                username,
                nickname: nickname || username,
                avatarColor
            }
        });
        
    } catch (error) {
        console.error('注册错误:', error);
        res.status(500).json({ error: '服务器错误，请稍后重试' });
    }
});

/**
 * 用户登录
 * POST /api/login
 * 请求体: { username, password }
 */
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // 验证必填字段
        if (!username || !password) {
            return res.status(400).json({ error: '请输入用户名和密码' });
        }
        
        // 查找用户
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        
        // 验证密码
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        
        // 生成令牌
        const token = generateToken(user.id);
        
        res.json({
            message: '登录成功',
            token,
            user: {
                id: user.id,
                username: user.username,
                nickname: user.nickname,
                avatarColor: user.avatar_color
            }
        });
        
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ error: '服务器错误，请稍后重试' });
    }
});

/**
 * 获取当前用户信息
 * GET /api/me
 * 需要登录（带 token）
 */
app.get('/api/me', authMiddleware, (req, res) => {
    try {
        const user = db.prepare('SELECT id, username, nickname, avatar_color, created_at FROM users WHERE id = ?').get(req.user.userId);
        
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        res.json({
            user: {
                id: user.id,
                username: user.username,
                nickname: user.nickname,
                avatarColor: user.avatar_color,
                createdAt: user.created_at
            }
        });
        
    } catch (error) {
        console.error('获取用户信息错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 留言相关 API ==========

/**
 * 获取所有留言
 * GET /api/messages
 */
app.get('/api/messages', (req, res) => {
    try {
        // 联表查询，获取留言和对应的用户信息
        const messages = db.prepare(`
            SELECT 
                m.id, m.content, m.created_at,
                u.id as user_id, u.username, u.nickname, u.avatar_color
            FROM messages m
            JOIN users u ON m.user_id = u.id
            ORDER BY m.created_at DESC
        `).all();
        
        // 格式化返回数据
        const formattedMessages = messages.map(msg => ({
            id: msg.id,
            content: msg.content,
            createdAt: msg.created_at,
            author: {
                id: msg.user_id,
                username: msg.username,
                nickname: msg.nickname,
                avatarColor: msg.avatar_color
            }
        }));
        
        res.json({ messages: formattedMessages });
        
    } catch (error) {
        console.error('获取留言错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

/**
 * 发表留言
 * POST /api/messages
 * 需要登录
 */
app.post('/api/messages', authMiddleware, (req, res) => {
    try {
        const { content } = req.body;
        
        // 验证内容
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: '留言内容不能为空' });
        }
        
        if (content.length > 500) {
            return res.status(400).json({ error: '留言内容不能超过 500 个字符' });
        }
        
        // 插入留言
        const result = db.prepare(
            'INSERT INTO messages (user_id, content) VALUES (?, ?)'
        ).run(req.user.userId, content.trim());
        
        // 获取用户信息
        const user = db.prepare('SELECT id, username, nickname, avatar_color FROM users WHERE id = ?').get(req.user.userId);
        
        res.status(201).json({
            message: '发表成功',
            data: {
                id: result.lastInsertRowid,
                content: content.trim(),
                createdAt: new Date().toISOString(),
                author: {
                    id: user.id,
                    username: user.username,
                    nickname: user.nickname,
                    avatarColor: user.avatar_color
                }
            }
        });
        
    } catch (error) {
        console.error('发表留言错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

/**
 * 删除留言
 * DELETE /api/messages/:id
 * 需要登录，只能删除自己的留言
 */
app.delete('/api/messages/:id', authMiddleware, (req, res) => {
    try {
        const messageId = req.params.id;
        
        // 查找留言
        const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
        
        if (!message) {
            return res.status(404).json({ error: '留言不存在' });
        }
        
        // 检查是否是自己的留言
        if (message.user_id !== req.user.userId) {
            return res.status(403).json({ error: '只能删除自己的留言' });
        }
        
        // 删除留言
        db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
        
        res.json({ message: '删除成功' });
        
    } catch (error) {
        console.error('删除留言错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 启动服务器 ==========
app.listen(PORT, () => {
    console.log(`🚀 服务器已启动: http://localhost:${PORT}`);
    console.log(`📝 API 文档:`);
    console.log(`   GET  /api/health     - 健康检查`);
    console.log(`   POST /api/register   - 用户注册`);
    console.log(`   POST /api/login      - 用户登录`);
    console.log(`   GET  /api/me         - 获取当前用户`);
    console.log(`   GET  /api/messages   - 获取留言列表`);
    console.log(`   POST /api/messages   - 发表留言`);
    console.log(`   DELETE /api/messages/:id - 删除留言`);
});
