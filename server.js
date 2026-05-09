const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'my-blog-secret-key-2024';
const DATA_FILE = '/tmp/blog-data.json';

let db = { users: [], messages: [] };

try {
  if (fs.existsSync(DATA_FILE)) {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    db = JSON.parse(data);
  }
} catch (e) {
  console.log('初始化数据文件');
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('保存失败:', e.message);
  }
}

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', users: db.users.length, messages: db.messages.length });
});

app.post('/api/register', (req, res) => {
  const { username, password, nickname } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (db.users.find(u => u.username === username)) {
    return res.status(400).json({ error: '用户名已被使用' });
  }
  const colors = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#e84393', '#fdcb6e'];
  const newUser = {
    id: Date.now(),
    username,
    password: bcrypt.hashSync(password, 10),
    nickname: nickname || username,
    avatarColor: colors[Math.floor(Math.random() * colors.length)]
  };
  db.users.push(newUser);
  saveData();
  const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user: { id: newUser.id, username, nickname: newUser.nickname, avatarColor: newUser.avatarColor } });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, nickname: user.nickname, avatarColor: user.avatarColor } });
});

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '请先登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期' });
  }
};

app.get('/api/messages', (req, res) => {
  const messages = db.messages
    .map(m => { const u = db.users.find(x => x.id === m.userId); return u ? { id: m.id, content: m.content, createdAt: m.createdAt, author: { id: u.id, username: u.username, nickname: u.nickname, avatarColor: u.avatarColor } } : null; })
    .filter(m => m);
  res.json({ messages });
});

app.post('/api/messages', auth, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: '内容不能为空' });
  const user = db.users.find(u => u.id === req.user.userId);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  const msg = { id: Date.now(), userId: user.id, content: content.trim(), createdAt: new Date().toISOString() };
  db.messages.push(msg);
  saveData();
  res.status(201).json({ data: { id: msg.id, content: msg.content, createdAt: msg.createdAt, author: { id: user.id, username: user.username, nickname: user.nickname, avatarColor: user.avatarColor } } });
});

app.delete('/api/messages/:id', auth, (req, res) => {
  const idx = db.messages.findIndex(m => m.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: '留言不存在' });
  if (db.messages[idx].userId !== req.user.userId) return res.status(403).json({ error: '只能删除自己的留言' });
  db.messages.splice(idx, 1);
  saveData();
  res.json({ message: '删除成功' });
});

module.exports = app;