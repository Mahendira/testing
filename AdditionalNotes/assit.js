const renderChatHistory = () => {
  return (
    <div className="chat-history">
      {chatHistory.map((message, index) => (
        <div
          key={index}
          className={`chat-message ${message.type === 'Text' ? 'user' : 'bot'}`}
        >
          {message.text}
        </div>
      ))}
    </div>
  );
};
=================
/* Add this CSS to your stylesheet or component styles */
.chat-history {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 10px;
  height: 300px; /* Adjust the height as needed */
  overflow-y: auto; /* Enable vertical scroll if the chat history overflows */
}

.chat-message {
  padding: 8px;
  margin: 4px;
  border-radius: 8px;
  max-width: 70%; /* Adjust the maximum width as needed */
}

.user {
  background-color: #007bff;
  color: white;
  align-self: flex-end;
}

.bot {
  background-color: #f0f0f0;
  color: #333;
  align-self: flex-start;
}
=====================
import React, { useState } from 'react';
import qa from './QA.json';

function Chatbot() {
  const [currentId, setCurrentId] = useState(1);
  const [chatHistory, setChatHistory] = useState([]);
  const [userInput, setUserInput] = useState('');

  const handleAnswerClick = (optionId) => {
    // ... (same as before)
  };

  const handleInputChange = (event) => {
    setUserInput(event.target.value);
  };

  const handleInputSubmit = () => {
    if (userInput.trim() !== '') {
      // Add the user's question to the chat history
      setChatHistory([...chatHistory, { text: userInput, type: 'User' }]);

      // Move on to the next question
      const currentQuestion = qa.find((q) => q.id === currentId);
      setCurrentId(currentQuestion.options[0].nextId);

      // Clear the input field
      setUserInput('');
    }
  };

  const renderOptions = (options) => {
    // ... (same as before)
  };

  const renderCurrentQuestion = () => {
    // ... (same as before)
  };

  const renderChatHistory = () => {
    return (
      <div className="chat-history">
        {chatHistory.map((message, index) => (
          <div
            key={index}
            className={`chat-message ${message.type === 'User' ? 'user' : 'bot'}`}
          >
            {message.text}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="chat-container">
        {renderChatHistory()}
        <div className="user-input">
          <input
            type="text"
            value={userInput}
            onChange={handleInputChange}
            placeholder="Type your message..."
          />
          <button onClick={handleInputSubmit}>Send</button>
        </div>
      </div>
      <div className="current-question">{renderCurrentQuestion()}</div>
    </div>
  );
}

export default Chatbot;
========================
