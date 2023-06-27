const express = require('express');
const path = require('path');
const http = require('http');
const { engine } = require('express-handlebars');
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
const db = require('./db.js');
const multer  = require('multer');
const upload = multer({ storage: multer.memoryStorage() })

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.engine('handlebars', engine({
  layoutsDir: __dirname + '/public',
}));
app.set('view engine', 'handlebars');
app.set('views', __dirname + '/public');

const server = http.createServer(app);
const io = new Server(server);

app.get('/', async (req, res) => {
  let session = req.cookies.session;
  
  if (session) {
    let user = await db.getUserBy('session', session);
    console.log('found session');
    if (user) {
      return res.redirect('/chat');
    }
  }
  res.render('index');
});

app.get('/chat', async (req, res) => {
  let session = req.cookies.session;
  if (!session) return res.redirect('/');
  let user = await db.getUserBy('session', session);
  if (!user) return res.redirect('/');
  let data = user.data();
  res.render('chat', {
    profile: data.profilePic,
  });
});

app.get('/profile', async (req, res) => {
  let session = req.cookies.session;
  if (!session) return res.redirect('/');
  let user = await db.getUserBy('session', session);
  if (!user) return res.redirect('/');
  let data = user.data();
  res.render('profile', {
    profilePic: data.profilePic,
    username: data.username,
    email: data.email,
  });
});



app.get('/logout', async (req, res) => {
  let session = req.cookies.session;
  await db.clearSession(session);
  res.clearCookie('session');
  res.redirect('/');
});

app.post('/login', async (req, res) => {
  console.log('login');
  console.log(req.body);

  const email = req.body.email;
  const password = req.body.pass;

  let correct = await db.checkUserPassword(email, password);
  if (!correct) return res.json({error: "username or password incorrect"});
  let session = await db.createUserSession(email);
  res.cookie('session', session, {httpOnly: true});
  res.json({success: true});
});

app.post('/signup', async (req, res) => {
  console.log('signup');
  console.log(req.body);

  const email = req.body.email;
  const password = req.body.pass;
  const pass2 = req.body.pass2;

  if (password !== pass2) {
    console.log('passwords don\'t match')
    res.json({error: "passwords do not match"});
    return;
  }
  if (await db.userExists(email)) {
    res.json({error: "user already exists"});
    return;
  }

  let session = await db.makeNewUser(email, password);
  res.cookie('session', session, {httpOnly: true});
  console.log('session: ' + session)
  res.json({success: "signed up!"})
});

app.post('/updateUsername', async (req, res) => {
  let session = req.cookies.session;
  if (!session) return res.redirect('/');
  let user = await db.getUserBy('session', session);
  if (!user) return res.redirect('/');

  // check if username is taken
  let usernameUser = await db.getUserBy('username', req.body.username);
  if (usernameUser) {
    return res.json({error: "username already taken"});
  }

  let username = req.body.username;
  await db.updateUserData(session, {username: username});
  res.json({success: 'username updated successfully'});
});


app.post('/updatePassword', async (req, res) => {
  let session = req.cookies.session;
  if (!session) return res.redirect('/');
  let user = await db.getUserBy('session', session);
  if (!user) return res.redirect('/');
  let data = user.data();

  let oldPass = req.body.oldPass;
  let newPass = req.body.newPass;
  if (!oldPass || !newPass) return res.json({error: "missing password"});
  if (!(await db.checkUserPassword(data.email, oldPass))) return res.json({error: "incorrect original password"});

  await db.updateUserData(session, {password: newPass});
  res.json({success: 'password updated successfully'});
});

app.post('/setProfilePicture', upload.single('profilePic'), async (req, res) => {
  let session = req.cookies.session;
  if (!session) return res.redirect('/');
  let user = await db.getUserBy('session', session);
  if (!user) return res.redirect('/');
  let data = user.data();

  let file = req.file;
  let ext = file.mimetype.split('/')[1];
  let name = "" + (Math.floor(Math.random() * 1e15)) + '.' + ext;
  let url = await db.uploadFile(file, name);
  await db.updateUserData(session, {profilePic: url});
  res.json({success: 'profile picture updated successfully'});
});


io.on('connection', (socket) => {
  console.log('a user connected');

  db.getLastMessages(50).then(async messages => {
    for (let msg of messages.reverse()) {
      let userId = msg.user;
      let user = await db.getUserBy('id', userId);
      let data = user.data();
      socket.emit('message', msg.message, data.username, data.profilePic);
    }
  });
  

  socket.on('message', async msg => {
    let session = socket.handshake.headers.cookie.split('=')[1];
    if (!session) return;

    let user = await db.getUserBy('session', session);
    let data = user.data();
    io.emit('message', msg, data.username, data.profilePic);

    await db.uploadMessage(msg, session);
  })
});


server.listen(3000, () => {
  console.log('server started at http://localhost:3000');
});
