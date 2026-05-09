/**
 * 博客后端服务器 - Vercel Postgres 版本
 * 
 * 技术栈：Node.js + Express + PostgreSQL
 */

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'my-blog-secret-key-2024';

// PostgreSQL 连接
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());

// 初始化数据库
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      nickname VARCHAR(50),
      avatar_color VARCHAR(20) DEFAULT '#6c5ce7',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ 数据库初始化完成');
}

// 生成 JWT
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

// 验证中间件
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }
  
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ error: '登录已过期' });
  }
}

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '服务器运行正常' });
});

// 用户注册
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度 3-20 字符' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 个字符' });
    }
    
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: '用户名已被使用' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const colors = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#e84393', '#fdcb6e'];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];
    
    const result = await pool.query(
      'INSERT INTO users (username, password, nickname, avatar_color) VALUES ($1, $2, $3, $4) RETURNING id',
      [username, hashedPassword, nickname || username, avatarColor]
    );
    
    const token = generateToken(result.rows[0].id);
    
    res.status(201).json({
      message: '注册成功',
      token,
      user: {
        id: result.rows[0].id,
        username,
        nickname: nickname || username,
        avatarColor
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 用户登录
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }
    
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = userResult.rows[0];
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
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
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取当前用户
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, nickname, avatar_color, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    const user = result.rows[0];
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

// 获取留言列表
app.get('/api/messages', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.id, m.content, m.created_at,
             u.id as user_id, u.username, u.nickname, u.avatar_color
      FROM messages m
      JOIN users u ON m.user_id = u.id
      ORDER BY m.created_at DESC
    `);
    
    const messages = result.rows.map(msg => ({
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
    
    res.json({ messages });
  } catch (error) {
    console.error('获取留言错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 发表留言
app.post('/api/messages', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: '留言内容不能为空' });
    }
    if (content.length > 500) {
      return res.status(400).json({ error: '留言内容不能超过 500 个字符' });
    }
    
    const result = await pool.query(
      'INSERT INTO messages (user_id, content) VALUES ($1, $2) RETURNING id, created_at',
      [req.user.userId, content.trim()]
    );
    
    const userResult = await pool.query(
      'SELECT id, username, nickname, avatar_color FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    const user = userResult.rows[0];
    
    res.status(201).json({
      message: '发表成功',
      data: {
        id: result.rows[0].id,
        content: content.trim(),
        createdAt: result.rows[0].created_at,
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

// 删除留言
app.delete('/api/messages/:id', authMiddleware, async (req, res) => {
  try {
    const messageId = req.params.id;
    
    const messageResult = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    const message = messageResult.rows[0];
    
    if (!message) {
      return res.status(404).json({ error: '留言不存在' });
    }
    
    if (message.user_id !== req.user.userId) {
      return res.status(403).json({ error: '只能删除自己的留言' });
    }
    
    await pool.query('DELETE FROM messages WHERE id = $1', [messageId]);
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除留言错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 启动服务器
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 服务器已启动: http://localhost:${PORT}`);
  });
});
