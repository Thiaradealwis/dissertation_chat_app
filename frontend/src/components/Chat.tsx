import { useState, useEffect } from "react";
import socket from "../socket";

interface Message {
    sender: string;
    content: string;
    time?: string;
}

export default function Chat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");

    const [username, setUsername] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);

    const colourMap: { [key: string]: string } = {
        Red: "text-red-600",
        Blue: "text-blue-600",
        Green: "text-green-600",
        Yellow: "text-yellow-600",
    };

    useEffect(() => {
        // Get sessionId from URL query params
        const urlParams = new URLSearchParams(window.location.search);
        const sharedSessionId = urlParams.get("sessionId"); // e.g., ?sessionId=abc123

        // Join the session (existing or new)
        socket.emit("join session", { sessionId: sharedSessionId });

        socket.on("session joined", ({ sessionId, username }) => {
            setUsername(username);
            setSessionId(sessionId);
        });

        // Listen for messages
        socket.on("chat message", (msg: Message) => {
            setMessages((prev) => [...prev, msg]);
        });

        socket.on("ai-start", () => {
            setIsTyping(true);
            setMessages((prev) => [...prev, { sender: "AI Agent", content: "" }]);
        });

        socket.on("ai-update", (text: string) => {
            setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.sender === "AI Agent") {
                    last.content = text;
                }
                return updated;
            });
        });

        socket.on("ai-end", () => setIsTyping(false));

        return () => {
            socket.off("session joined");
            socket.off("chat message");
            socket.off("ai-start");
            socket.off("ai-update");
            socket.off("ai-end");
        };
    }, []);

    const sendMessage = () => {
        if (!input.trim() || !username || !sessionId) return;

        const msg: Message = {
            sender: username,
            content: input,
            time: new Date().toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit"
            })
        };

        socket.emit("chat message", { sessionId, content: input });
        setInput("");
    };

    return (
        <div className="flex flex-col h-screen p-4">
            {sessionId && (
                <div className="mt-2 text-sm text-gray-600">
                    Share this link for others to join:
                    <code>{`${window.location.origin}?sessionId=${sessionId}`}</code>
                </div>
            )}
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto border p-4 rounded bg-gray-50">
                {messages.map((msg, i) => (
                    <div key={i} className="mb-2">
                        <strong>{msg.sender}: </strong>
                        <span>{msg.content}</span>
                        {msg.time && <span className="text-gray-400 ml-2">{msg.time}</span>}
                    </div>
                ))}

                {isTyping && (
                    <div className="italic text-gray-500 mt-2">
                        AI Agent is typing...
                    </div>
                )}
            </div>

            {/* Message input */}
            <div className="mt-4 flex gap-2">
                {username && (
                    <div className={`mb-2 font-bold ${colourMap[username]}`}>
                        You are: {username}
                    </div>
                )}
                <input
                    type="text"
                    placeholder="Type a message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="border p-2 rounded flex-1"
                    disabled={!username}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                />
                <button
                    onClick={sendMessage}
                    className="bg-blue-600 text-yellow px-4 py-2 rounded disabled:opacity-50"
                    disabled={!username}
                >
                    Send
                </button>
                <button
                    onClick={() => {
                        if (sessionId) {
                            window.open(`http://localhost:4000/transcript/${sessionId}`);
                        }
                    }}
                    className="bg-gray-600 text-white px-4 py-2 rounded"
                >
                    Download Transcript
                </button>
            </div>
        </div>
    );
}