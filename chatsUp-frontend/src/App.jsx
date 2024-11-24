import { useState, useEffect, useCallback, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import { LuSendHorizonal, LuSearch } from "react-icons/lu";
import { RiAttachment2 } from "react-icons/ri";

import unknown_person from "./assets/Unknown_person.png";

const socket = io("https://chatsup-backend.onrender.com");

// const socket = io("http://localhost:3000");

function App() {
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [message, setMessage] = useState("");
  const [chats, setChats] = useState({});
  const [error, setError] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [mediaPreview, setMediaPreview] = useState(null);
  const fileInputRef = useRef(null);

  const updateUserList = useCallback(
    (userList) => {
      console.log("Received user list:", userList);
      setUsers(userList.filter((user) => user.name !== username));
    },
    [username]
  );

  useEffect(() => {
    socket.on("userList", updateUserList);

    socket.on("newMessage", (msg) => {
      console.log("id", selectedUser);
      setChats((prevChats) => ({
        ...prevChats,
        [selectedUser.id]: [
          ...(prevChats[selectedUser.id] || []),
          { ...msg, timestamp: Date.now().toLocaleString() },
        ],
      }));
    });

    socket.on("chatHistory", ({ userId, history }) => {
      setChats((prevChats) => ({
        ...prevChats,
        [userId]: history.sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        ),
      }));
    });

    socket.on("loginError", (errorMessage) => {
      setError(errorMessage);
      setIsLoggedIn(false);
    });

    socket.on("messageError", (errorMessage) => {
      setError(errorMessage);
    });

    socket.on("chatHistoryError", (errorMessage) => {
      setError(errorMessage);
    });

    socket.on("userTyping", ({ userId, isTyping }) => {
      setTypingUsers((prev) => ({ ...prev, [userId]: isTyping }));
    });

    return () => {
      socket.off("userList");
      socket.off("newMessage");
      socket.off("chatHistory");
      socket.off("loginError");
      socket.off("messageError");
      socket.off("chatHistoryError");
      socket.off("userTyping");
    };
  }, [updateUserList, selectedUser]);

  const chatEndRef = useRef(null);

  // Function to scroll to the bottom
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Scroll to the bottom whenever messages change
  useEffect(() => {
    scrollToBottom();
  }, [chats]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (username.trim()) {
      socket.emit("login", username);
      setIsLoggedIn(true);
      socket.emit("requestUserList");
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (selectedUser && (message.trim() || mediaPreview)) {
      let mediaUrl = null;
      let mediaType = null;

      if (mediaPreview) {
        const formData = new FormData();
        formData.append("media", fileInputRef.current.files[0]);

        try {
          const response = await axios.post(
            "https://chatsup-backend.onrender.com/upload",
            formData
          );
          mediaUrl = response.data.url;
          mediaType = response.data.mediaType;
        } catch (error) {
          console.error("Error uploading media:", error);
          return;
        }
      }

      socket.emit("sendMessage", {
        receiverId: selectedUser.id,
        content: message,
        mediaUrl,
        mediaType,
      });

      setMessage("");
      setMediaPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const selectUser = (user) => {
    setSelectedUser(user);
    socket.emit("getChatHistory", { userId: user.id });
  };

  const handleTyping = (e) => {
    setMessage(e.target.value);
    if (!isTyping) {
      setIsTyping(true);
      socket.emit("typing", { receiverId: selectedUser.id, isTyping: true });
      setTimeout(() => {
        setIsTyping(false);
        socket.emit("typing", { receiverId: selectedUser.id, isTyping: false });
      }, 2000);
    }
  };

  const renderMessage = (msg) => (
    <div
      key={msg.id}
      className={`mb-2 ${msg.senderId === "me" ? "text-right" : "text-left"}`}
    >
      <span
        className={`inline-block p-2 rounded-lg ${
          msg.senderId === "me"
            ? "bg-[#F9770A] text-white"
            : "bg-gray-300 text-black"
        } `}
      >
        {msg.content}
        {msg.mediaUrl && (
          <div className="mt-2">
            {msg.mediaType.startsWith("image") ? (
              <img
                src={msg.mediaUrl}
                alt="Shared media"
                className="max-w-xs max-h-xs"
              />
            ) : msg.mediaType.startsWith("video") ? (
              <video
                src={msg.mediaUrl}
                controls
                className="max-w-xs max-h-xs"
              />
            ) : msg.mediaType.startsWith("audio") ? (
              <audio src={msg.mediaUrl} controls />
            ) : (
              <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
                Download file
              </a>
            )}
          </div>
        )}
      </span>
      <div className="text-xs text-gray-500 mt-1">
        {msg.timestamp.toLocaleString()}
      </div>
    </div>
  );

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen w-screen bg-[#efdccf]">
        <form
          onSubmit={handleLogin}
          className="bg-[#3e3b39] p-8 rounded shadow-md"
        >
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            className="w-full bg-[#f2f2f2] text-black p-2 border rounded mb-4"
          />
          <button
            type="submit"
            className="w-full bg-[#F9770A] text-white p-2 rounded"
          >
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen">
      {error && (
        <div className="absolute top-0 left-0 right-0 bg-red-500 text-white p-2 text-center">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-bold">
            ×
          </button>
        </div>
      )}
      <div className="lg:w-1/4 w-1/3 bg-white overflow-y-auto">
        <div className="flex flex-row justify-around p-2 items-center w-full h-10 rounded-lg bg-gray-100 border-[1px] border-slate-200 drop-shadow-sm mt-2">
          <LuSearch color="gray" />{" "}
          <input
            placeholder="Search"
            className="w-full ml-2 bg-gray-100  text-black outline-none"
          />
        </div>
        <div className="h-[1px] bg-gray-200 w-full mt-5" />
        {users.length === 0 ? (
          <p>No other users online</p>
        ) : (
          <ul>
            {users.map((user) => (
              <>
                <li
                  key={user.id}
                  onClick={() => selectUser(user)}
                  className={`cursor-pointer flex flex-row items-center text-black h-16 p-2 ${
                    selectedUser && selectedUser.id === user.id
                      ? " border-l-4 border-red-500 bg-gray-100"
                      : ""
                  }`}
                >
                  <img
                    src={unknown_person}
                    className="h-8  rounded-full mr-2"
                  />
                  {user.name} {user.isOnline ? "🟢" : "🔴"}
                </li>
                <div className="h-[1px] bg-gray-300 min-w-full" />
              </>
            ))}
          </ul>
        )}
      </div>
      <div className="flex-1 bg-white flex flex-col border-l-[1px] border-gray-100">
        {selectedUser && chats[selectedUser.id] && (
          <div className="w-full text-black font-semibold flex flex-row items-center bg-gray-200 p-2">
            <img src={unknown_person} className="h-8  rounded-full mr-2" />{" "}
            <div>
              {selectedUser.name}
              {typingUsers[selectedUser.id] && (
                <div className="text-gray-500 text-sm italic">typing...</div>
              )}
            </div>
          </div>
        )}
        <div className="flex-1 p-4 overflow-y-auto">
          {selectedUser && chats[selectedUser.id] ? (
            <>{chats[selectedUser.id].map(renderMessage)}</>
          ) : (
            <p className="text-black">Select a user to start chatting</p>
          )}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleSendMessage} className="p-4 bg-white">
          <div className="flex flex-col">
            {mediaPreview && (
              <div className="mb-2">
                <img
                  src={mediaPreview}
                  alt="Media preview"
                  className="max-w-xs max-h-xs"
                />
                <button
                  onClick={() => setMediaPreview(null)}
                  className="ml-2 text-red-500"
                >
                  Remove
                </button>
              </div>
            )}
            <div className="h-[1px] w-full bg-gray-100 mb-5" />
            <div className="flex bg-gray-200 rounded-md">
              <input
                type="text"
                value={message}
                onChange={handleTyping}
                placeholder="Type your message here"
                className="flex-1 p-2 border rounded-l-md outline-none text-black bg-gray-200"
                disabled={!selectedUser}
              />
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,video/*,audio/*"
              />
              <div
                type="button"
                onClick={() => fileInputRef.current.click()}
                className="p-2 flex justify-center items-center cursor-pointer"
                disabled={!selectedUser}
              >
                <RiAttachment2 color="orange" />
              </div>
              <div
                type="submit"
                className="flex m-1 items-center cursor-pointer justify-center bg-orange-100 p-2 rounded-r"
                disabled={!selectedUser}
                onClick={handleSendMessage}
              >
                <LuSendHorizonal color="orange" />
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
