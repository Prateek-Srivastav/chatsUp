require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { drizzle } = require("drizzle-orm/node-postgres");
const {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
} = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { Pool } = require("pg");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const cors = require("cors");

cloudinary.config({
  cloud_name: "dgmrmyrqk",
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "chat_media",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "mp4", "mp3"],
  },
});

const upload = multer({ storage: storage });

const app = express();

app.use(
  cors({
    origin: "https://koreai-assignment.onrender.com",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://koreai-assignment.onrender.com",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const pool = new Pool({
  connectionString: process.env.DB,
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.CA,
  },
});

const db = drizzle(pool);

const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  lastSeen: timestamp("last_seen").defaultNow(),
  isOnline: boolean("is_online").default(false),
});

const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").references(() => users.id),
  receiverId: integer("receiver_id").references(() => users.id),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"),
  timestamp: timestamp("timestamp").defaultNow(),
});

async function createTablesIfNotExist() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_online BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER REFERENCES users(id),
      receiver_id INTEGER REFERENCES users(id),
      content TEXT NOT NULL,
      media_url TEXT,
      media_type TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

app.post("/upload", upload.single("media"), (req, res) => {
  console.log("req");
  res.json({ url: req.file.path, mediaType: req.file.mimetype });
});

const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("login", async (username) => {
    try {
      let [user] = await db
        .select()
        .from(users)
        .where(sql`name = ${username}`);
      if (!user) {
        [user] = await db
          .insert(users)
          .values({ name: username, isOnline: true })
          .returning();
      } else {
        [user] = await db
          .update(users)
          .set({ isOnline: true, lastSeen: new Date() })
          .where(sql`id = ${user.id}`)
          .returning();
      }
      onlineUsers.set(socket.id, user);
      socket.userId = user.id;
      io.emit("userList", await getUserList());
    } catch (error) {
      console.error("Error during login:", error);
      socket.emit("loginError", "Failed to log in. Please try again.");
    }
  });

  socket.on("requestUserList", async () => {
    socket.emit("userList", await getUserList());
  });

  socket.on("sendMessage", async (data) => {
    const { receiverId, content, mediaUrl, mediaType } = data;
    const sender = onlineUsers.get(socket.id);

    if (sender) {
      try {
        const [message] = await db
          .insert(messages)
          .values({
            senderId: sender.id,
            receiverId,
            content,
            mediaUrl,
            mediaType,
            timestamp: sql`CURRENT_TIMESTAMP`,
          })
          .returning();

        const receiverSocket = Array.from(onlineUsers.entries()).find(
          ([_, user]) => user.id === receiverId
        )?.[0];
        if (receiverSocket) {
          io.to(receiverSocket).emit("newMessage", {
            id: message.id,
            senderId: sender.id,
            content: message.content,
            mediaUrl: message.mediaUrl,
            mediaType: message.mediaType,
            timestamp: message.timestamp,
          });
        }

        socket.emit("newMessage", {
          id: message.id,
          senderId: "me",
          content: message.content,
          mediaUrl: message.mediaUrl,
          mediaType: message.mediaType,
          timestamp: message.timestamp,
        });
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit(
          "messageError",
          "Failed to send message. Please try again."
        );
      }
    }
  });

  socket.on("getChatHistory", async ({ userId }) => {
    try {
      const history = await db
        .select({
          id: messages.id,
          senderId: messages.senderId,
          content: messages.content,
          mediaUrl: messages.mediaUrl,
          mediaType: messages.mediaType,
          timestamp: messages.timestamp,
        })
        .from(messages)
        .where(
          sql`(sender_id = ${socket.userId} AND receiver_id = ${userId}) OR 
            (sender_id = ${userId} AND receiver_id = ${socket.userId})`
        )
        .orderBy(sql`timestamp ASC`);

      const formattedHistory = history.map((msg) => ({
        id: msg.id,
        senderId: msg.senderId === socket.userId ? "me" : msg.senderId,
        content: msg.content,
        mediaUrl: msg.mediaUrl,
        mediaType: msg.mediaType,
        timestamp: msg.timestamp,
      }));

      socket.emit("chatHistory", { userId, history: formattedHistory });
    } catch (error) {
      console.error("Error fetching chat history:", error);
      socket.emit(
        "chatHistoryError",
        "Failed to fetch chat history. Please try again."
      );
    }
  });

  socket.on("typing", ({ receiverId, isTyping }) => {
    const receiverSocket = Array.from(onlineUsers.entries()).find(
      ([_, user]) => user.id === receiverId
    )?.[0];
    if (receiverSocket) {
      io.to(receiverSocket).emit("userTyping", {
        userId: socket.userId,
        isTyping,
      });
    }
  });

  socket.on("disconnect", async () => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      await db
        .update(users)
        .set({ isOnline: false, lastSeen: new Date() })
        .where(sql`id = ${user.id}`);
      onlineUsers.delete(socket.id);
      io.emit("userList", await getUserList());
    }
  });
});

async function getUserList() {
  const userList = await db.select().from(users);
  return userList.map((user) => ({
    ...user,
    isOnline: Array.from(onlineUsers.values()).some(
      (onlineUser) => onlineUser.id === user.id
    ),
  }));
}

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await createTablesIfNotExist();
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
}

startServer();
