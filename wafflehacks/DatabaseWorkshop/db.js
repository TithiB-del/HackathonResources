var admin = require("firebase-admin");
var { FieldValue } = require("firebase-admin/firestore") 
var creds = require('./database-workshop-b0515-firebase-adminsdk-4mamy-59017d6778.json');

const bucketurl = 'gs://database-workshop-b0515.appspot.com'

admin.initializeApp({
    credential: admin.credential.cert(creds),
    storageBucket: bucketurl
});

const db = admin.firestore();
const messages = db.collection('Chat');
const users = db.collection('Users');

const bucket = admin.storage().bucket();

async function getUserBy(type, name) {
    if (type == 'id'){
        return await users.doc(name).get();
    }
    const user = await users.where(type, '==', name).get();
    if (user.docs.length == 0) return false;
    return user.docs[0];
}
  
async function userExists(email){
    let user = await getUserBy('email', email);
    return user !== false;
}
  
async function checkUserPassword(email, password) {
    let user = await getUserBy('email', email);
    if (!user) return;
    console.log('checking password:', user.data().password, password);
    return user.data().password === password;
}

async function makeNewUser(email, password) {
    console.log('adding new user', email, password);
    await users.add({
        email: email,
        password: password,
        profilePic: '/images/dog.jpeg',
        username: email,
    });
    console.log('added user');
    return await createUserSession(email);
}

async function createUserSession(email) {
    let user = await getUserBy('email', email);
    if (!user) return false;
    var session = Math.floor(Math.random() * 1e15) + "";
    await users.doc(user.id).update({
        session: session
    });
    return session;
}

async function clearSession(session) {
    let user = await getUserBy('session', session);
    if (!user) return;
    await users.doc(user.id).update({
        session: FieldValue.delete()
    });
}

async function updateUserData(session, data) {
    let user = await getUserBy('session', session);
    if (!user) return;
    await users.doc(user.id).update(data);
}

async function uploadFile(file, name) {
    // make file public
    await bucket.file(name).createWriteStream({
        metadata: {
            contentType: file.mimetype
        },
        public: true
    }).end(file.buffer);
    return `https://storage.googleapis.com/${bucket.name}/${name}`;
}

async function uploadMessage(message, session) {
    let user = await getUserBy('session', session);
    if (!user) return false;
    await messages.add({
        message: message,
        user: user.id,
        timestamp: Date.now()
    });
    return user;
}

async function getLastMessages(num) {
    let msgs = await messages.orderBy('timestamp', 'desc').limit(num).get();
    return msgs.docs.map(msg => msg.data());
}

module.exports = {
    getUserBy,
    userExists,
    checkUserPassword,
    makeNewUser,
    createUserSession,
    clearSession,
    updateUserData,
    uploadFile,
    uploadMessage,
    getLastMessages
}
