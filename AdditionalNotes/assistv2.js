import React, { useState, useEffect } from 'react';
import qa from './qa.json';

function Chatbot() {
  const [currentId, setCurrentId] = useState(1);
  const [chatHistory, setChatHistory] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [variables, setVariables] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [responseText, setResponseText] = useState('');

  const handleAnswerClick = (optionId) => {
    const currentQuestion = qa.find((q) => q.id === currentId);
    const option = currentQuestion.options.find((o) => o.id === optionId);

    setChatHistory([...chatHistory, { text: option.text }]);

    if (currentQuestion.messageType === 'Text') {
      return;
    }

    setCurrentId(option.nextId);
  };

  const handleInputChange = (event) => {
    setUserInput(event.target.value);
  };

  const handleInputSubmit = () => {
    if (userInput.trim() !== '') {
      setVariables({ ...variables, [currentId]: userInput });

      setChatHistory([...chatHistory, { text: userInput, type: 'UserInput' }]);

      const currentQuestion = qa.find((q) => q.id === currentId);
      setCurrentId(currentQuestion.options[0].nextId);

      setUserInput('');
    }
  };

  const renderOptions = (options) => {
    return (
      <div>
        {options.map((option) => (
          <button key={option.id} onClick={() => handleAnswerClick(option.id)}>
            {option.text}
          </button>
        ))}
      </div>
    );
  };

  const renderCurrentQuestion = () => {
    const currentQuestion = qa.find((q) => q.id === currentId);
    if (currentQuestion) {
      return (
        <div>
          <p>{currentQuestion.text}</p>
          {currentQuestion.messageType === 'Question' && renderOptions(currentQuestion.options)}
          {currentQuestion.messageType === 'Text' && (
            <div>
              <input type="text" value={userInput} onChange={handleInputChange} />
              <button onClick={handleInputSubmit}>Submit</button>
            </div>
          )}
        </div>
      );
    }
  };

  const renderChatHistory = () => {
    return (
      <div className="chat-history">
        {chatHistory.map((message, index) => (
          <div
            key={index}
            className={`chat-message ${message.type === 'UserInput' ? 'user' : 'bot'}`}
          >
            {message.text}
          </div>
        ))}
        {isLoading && (
          <div className="chat-message bot">Bot is processing your request...</div>
        )}
        {responseText && (
          <div className="chat-message bot">{responseText}</div>
        )}
      </div>
    );
  };

  useEffect(() => {
    const currentQuestion = qa.find((q) => q.id === currentId);
    if (currentQuestion && currentQuestion.messageType === 'UserInputWithRequest') {
      setIsLoading(true);

      fetch(currentQuestion.requestUrl)
        .then((response) => response.json())
        .then((data) => {
          setIsLoading(false);

          setChatHistory([...chatHistory, { text: data.response, type: 'UserResponse' }]);

          setResponseText(data.response);

          setCurrentId(currentQuestion.nextIdForResponse);
        })
        .catch((error) => {
          setIsLoading(false);

          console.error('Error:', error);
        });
    }
  }, [currentId, qa, chatHistory]);

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
