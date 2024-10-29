const express = require('express');
const { Pool } = require('pg'); // PostgreSQL用のパッケージをインポート
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 4000;

// PostgreSQLのプールを作成
const pool = new Pool({
  connectionString: 'postgresql://dreams_db_2p3a_user:IBMbFf36OuLky2VCU2UQ3SIGGkYHkgLi@dpg-csgbu068ii6s739fegd0-a.oregon-postgres.render.com/dreams_db_2p3a',
  ssl: {
      rejectUnauthorized: false, // SSL証明書の検証を無効にする（Renderでは必要な場合があります）
  },
});

// サーバーを開始
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// CORSの設定を追加
const allowedOrigins = [
  'https://yume-log-frontend.vercel.app/',
  'http://localhost:3000',
];

app.use(cors({
  origin: allowedOrigins, // 許可するオリジンを指定
  methods: ['GET', 'POST'], // 許可するHTTPメソッドを指定
  credentials: true // 認証情報を含むリクエストを許可
}));

app.use(express.json());

// 夢の投稿
app.post('/api/dreams', async (req, res) => {
  const { user_id, title, content, tag, location } = req.body;
  try {
    const result = await pool.query('INSERT INTO dreams (user_id, title, content, tag, location) VALUES ($1, $2, $3, $4, $5) RETURNING id', [user_id, title, content, tag, location]);
    res.status(201).json({ message: '夢が投稿されました！', id: result.rows[0].id });
  } catch (error) {
    console.error('エラー:', error);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 夢のリアクション追加
app.post('/api/reactions', async (req, res) => {
  const { dream_id, reaction_type } = req.body;
  const sql = 'INSERT INTO reactions (dream_id, reaction_type) VALUES ($1, $2)';
  try {
    const result = await pool.query(sql, [dream_id, reaction_type]);
    res.status(201).json({ message: 'リアクションが追加されました', id: result.insertId });
  } catch (error) {
    console.error('エラー:', error);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// おすすめの夢を取得する
app.get('/api/dreams/recommended', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM dreams ORDER BY RANDOM() LIMIT 5'); // PostgreSQLではRANDOM()を使用
    res.json(result.rows);
  } catch (error) {
    console.error('エラー:', error);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 夢の取得
app.get('/api/dreams/display', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.id, d.title, d.content, d.tag, d.location, d.view_count,
             SUM(CASE WHEN r.reaction_type = 'ok' THEN 1 ELSE 0 END) AS ok_count,
             SUM(CASE WHEN r.reaction_type = 'happy' THEN 1 ELSE 0 END) AS happy_count,
             SUM(CASE WHEN r.reaction_type = 'scary' THEN 1 ELSE 0 END) AS scary_count,
             SUM(CASE WHEN r.reaction_type = 'sad' THEN 1 ELSE 0 END) AS sad_count,
             SUM(CASE WHEN r.reaction_type = 'lonely' THEN 1 ELSE 0 END) AS lonely_count,
             SUM(CASE WHEN r.reaction_type = 'fun' THEN 1 ELSE 0 END) AS fun_count,
             SUM(CASE WHEN r.reaction_type = 'surprised' THEN 1 ELSE 0 END) AS surprised_count,
             SUM(CASE WHEN r.reaction_type = 'dislike' THEN 1 ELSE 0 END) AS dislike_count
      FROM dreams d
      LEFT JOIN reactions r ON d.id = r.dream_id
      GROUP BY d.id
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('エラー:', error);
    res.status(500).send('エラーが発生しました');
  }
});

// 夢の詳細取得
app.get('/api/dreams/:id', async (req, res) => {
  const dreamId = req.params.id;
  try {
    const result = await pool.query('SELECT * FROM dreams WHERE id = $1', [dreamId]);
    if (result.rows.length > 0) {
      res.json(result.rows[0]); // 結果を返す
    } else {
      res.status(404).json({ error: '夢が見つかりません' });
    }
  } catch (error) {
    console.error('データベースエラー:', error);
    res.status(500).json({ error: 'データベースエラー' });
  }
});

// 自分の夢を取得する
app.get('/api/dreams/my', async (req, res) => {
  const { user_id } = req.query;
  try {
    const result = await pool.query('SELECT * FROM dreams WHERE user_id = $1', [user_id]);
    res.json(result.rows);
  } catch (error) {
    console.error('エラー:', error);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ユーザー登録
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id',
      [username, hashedPassword]
    );
    res.status(201).json({ message: 'ユーザー登録が完了しました', userId: result.rows[0].id });
  } catch (error) {
    console.error('エラー:', error);
    res.status(400).json({ message: '登録に失敗しました。ユーザー名が重複しています。' });
  }
});

// ログイン
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0]; // 取得したユーザー

    if (!user) {
      console.log('ユーザーが見つかりません:', username);
      return res.status(401).json({ error: 'ユーザーが存在しません' });
    }
    
    // ハッシュの比較
    if (await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ id: user.id }, 'your-secret-key'); // トークン生成
      res.json({ token, user_id: user.id });
    } else {
      res.status(401).json({ error: 'ユーザー名またはパスワードが間違っています' });
    }
  } catch (error) {
    console.error('エラー:', error);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ホームルート
app.get('/', (req, res) => {
  console.log('APIに接続されました');
  res.send('ゆめログ API');
});
