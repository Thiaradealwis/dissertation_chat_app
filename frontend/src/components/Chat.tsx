import { useState, useEffect } from "react";
import socket from "../socket";

interface Message {
    sender: string;
    content: string;
}

export default function Chat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");

    const [username, setUsername] = useState("");
    const [isUsernameSet, setIsUsernameSet] = useState(false);
    const [isTyping, setIsTyping] = useState(false);

    const handleUsernameSubmit = () => {
        if (username.trim()) {
            setIsUsernameSet(true);
        }
    };

    useEffect(() => {
        // Listen for new messages
        socket.on("chat message", (msg: Message) => {
            setMessages((prev) => [...prev, msg]);
        });

        socket.on("ai-start", () => {
            setIsTyping(true);

            // Add empty AI message
            setMessages((prev) => [
                ...prev,
                { sender: "AI Agent", content: "" }
            ]);
        });

        socket.on("ai-update", (text: string) => {
            setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];

                if (last?.sender === "AI Agent") {
                    last.content = text;
                }

                return updated;
            });
        });

        socket.on("ai-end", () => {
            setIsTyping(false);
        });
        // 👆 STREAMING END

        return () => {
            socket.off("chat message");
            socket.off("ai-start");
            socket.off("ai-token");
            socket.off("ai-end");
        };
    }, []);

    const sendMessage = () => {
        if (input.trim() && username.trim()) {
            const msg: Message = { sender: username, content: input };
            socket.emit("chat message", msg);
            setInput("");
        }
    };

    return (
        <div className="flex flex-col h-screen p-4">
            {/* Username input */}
            {!isUsernameSet && (
                <div className="mb-4 flex gap-2">
                    <input
                        type="text"
                        placeholder="Enter your name..."
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="border p-2 rounded flex-1"
                        onKeyDown={(e) => e.key === "Enter" && handleUsernameSubmit()}
                    />
                    <button
                        onClick={handleUsernameSubmit}
                        className="bg-green-600 text-white px-4 py-2 rounded"
                    >
                        Set Name
                    </button>
                </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto border p-4 rounded bg-gray-50">
                {messages.map((msg, i) => (
                    <div key={i} className="mb-2">
                        <strong>{msg.sender}: </strong>
                        <span>{msg.content}</span>
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
            </div>
        </div>
    );
}