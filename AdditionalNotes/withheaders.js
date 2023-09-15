import React, { useState, useEffect } from 'react';
import qa from './qa.json';

function Chatbot() {
  const [currentId, setCurrentId] = useState(1);
  const [chatHistory, setChatHistory] = useState([]);
  const [userInput, setUserInput] = useState('');
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

  const handleSend = () => {
    if (userInput.trim() !== '') {
      setChatHistory([...chatHistory, { text: userInput, type: 'UserInput' }]);
      setUserInput('');

      const currentQuestion = qa.find((q) => q.id === currentId);

      // If the current message type allows a GET request
      if (currentQuestion.messageType === 'UserInputWithRequest') {
        setIsLoading(true);

        // Replace {userQuery} with the user's input in the URL
        const requestUrl = currentQuestion.requestUrl.replace('{userQuery}', userInput);

        // Define your custom headers here
        const headers = new Headers({
          'Content-Type': 'application/json',
          // Add any other headers you need
        });

        // Create the request with headers
        const requestOptions = {
          method: 'GET',
          headers: headers,
        };

        fetch(requestUrl, requestOptions)
          .then((response) => response.json())
          .then((data) => {
            setIsLoading(false);

            // Update the responseText state with the received response
            setResponseText(data.response);

            // Add the response to the chat history
            setChatHistory([...chatHistory, { text: data.response, type: 'UserResponse' }]);

            // Move to the next message
            setCurrentId(currentQuestion.nextIdForResponse);
          })
          .catch((error) => {
            setIsLoading(false);

            console.error('Error:', error);
          });
      } else {
        // If the current message type is not UserInputWithRequest, move to the next message
        setCurrentId(currentQuestion.options[0].nextId);
      }
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
              <button onClick={handleSend}>Send</button>
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
    // Initialize the chat by adding the first bot message
    setChatHistory([
      ...chatHistory,
      {
        text: qa[0].text,
        type: 'Bot',
      },
    ]);
  }, []);

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
          <button onClick={handleSend}>Send</button>
        </div>
      </div>
      <div className="current-question">{renderCurrentQuestion()}</div>
    </div>
  );
}

export default Chatbot;
