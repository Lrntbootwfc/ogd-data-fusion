// frontend/src/App.jsx
import { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [interimTranscript, setInterimTranscript] = useState("");
  
  const recognitionRef = useRef(null);
  const timeoutRef = useRef(null);

  // Initialize speech recognition
  useEffect(() => {
    const initializeSpeechRecognition = () => {
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        
        // Configure for better Indian English recognition
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-IN';
        recognitionRef.current.maxAlternatives = 3;

        recognitionRef.current.onstart = () => {
          console.log('Speech recognition started');
          setIsListening(true);
          setInterimTranscript("");
        };

        recognitionRef.current.onresult = (event) => {
          let finalTranscript = '';
          let interim = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interim += transcript;
            }
          }

          if (finalTranscript) {
            setQuestion(prev => prev + ' ' + finalTranscript.trim());
            setInterimTranscript("");
          } else if (interim) {
            setInterimTranscript(interim);
          }

          // Reset timeout on new results
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = setTimeout(() => {
            if (isListening) {
              stopListening();
            }
          }, 2000); // Stop after 2 seconds of silence
        };

        recognitionRef.current.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          setInterimTranscript("");
          
          switch (event.error) {
            case 'not-allowed':
            case 'permission-denied':
              setError('Microphone access denied. Please allow microphone permissions in your browser settings.');
              break;
            case 'network':
              setError('Network error occurred. Please check your internet connection.');
              break;
            default:
              setError('Error with voice recognition: ' + event.error);
          }
        };

        recognitionRef.current.onend = () => {
          console.log('Speech recognition ended');
          setIsListening(false);
          setInterimTranscript("");
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
        };

      } else {
        setVoiceSupported(false);
        console.warn('Speech recognition not supported in this browser');
      }
    };

    initializeSpeechRecognition();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isListening]);

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      try {
        setQuestion(prev => prev + ' '); // Add space for new content
        recognitionRef.current.start();
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        setIsListening(false);
        setError('Failed to start voice recognition. Please try again.');
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.error('Error stopping speech recognition:', error);
      }
    }
    setIsListening(false);
    setInterimTranscript("");
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setAnswer(null);
    setError(null);

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to fetch data from the intelligent system.");
      }

      setAnswer(data);
    } catch (err) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const clearQuestion = () => {
    setQuestion("");
    setInterimTranscript("");
  };

  const sampleQuestions = [
    "Compare the average annual rainfall in State_X and State_Y for the last N available years. In parallel, list the top M most produced crops of Crop_Type_C (by volume) in each of those states during the same period, citing all data sources.",
    "Identify the district in State_X with the highest production of Crop_Z in the most recent year available and compare that with the district with the lowest production of Crop_Z in State_Y?",
    "Analyze the production trend of Crop_Type_C in the Geographic_Region_Y over the last decade. Correlate this trend with the corresponding climate data for the same period and provide a summary of the apparent impact.",
  ];

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <div className="header-icon">🌾</div>
          <div className="header-text">
            <h1>Project Samarth: Intelligent Data Q&A</h1>
            <p>Query the Nation's Agriculture & Climate Data (Powered by data.gov.in)</p>
          </div>
        </div>
      </header>

      {/* --- Main Content Area --- */}
      <main className="main-content">
        {/* --- Question Input Section --- */}
        <form onSubmit={handleSubmit} className="query-form">
          <div className="input-container">
            <div className="textarea-wrapper">
              <textarea
                rows="4"
                value={question + (interimTranscript ? ` ${interimTranscript}` : '')}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a complex question about agriculture and climate patterns... or click the microphone to speak your question"
                disabled={loading}
                aria-label="Enter your question about agriculture and climate data"
              />
              {question && (
                <button 
                  type="button" 
                  className="clear-btn"
                  onClick={clearQuestion}
                  aria-label="Clear question"
                >
                  ✕
                </button>
              )}
            </div>
            
            <div className="controls-row">
              <div className="voice-controls">
                {voiceSupported ? (
                  <div className="voice-section">
                    <button 
                      type="button" 
                      className={`voice-btn ${isListening ? 'listening' : ''}`}
                      onClick={toggleListening}
                      disabled={loading}
                      aria-label={isListening ? 'Stop listening' : 'Start voice input'}
                    >
                      {isListening ? '🛑 Stop' : '🎤 Speak'}
                    </button>
                    {isListening && (
                      <div className="listening-status">
                        <div className="pulse-dots">
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                        <span>Listening... Speak now</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="voice-unsupported">
                    🎤 Voice input not supported in your browser
                  </div>
                )}
              </div>

              <button type="submit" disabled={loading || !question.trim()} className="submit-btn">
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Analyzing Data...
                  </>
                ) : (
                  <>
                    <span>🔍</span>
                    Get Insights
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* --- Sample Questions --- */}
        <div className="sample-questions">
          <div className="sample-header">
            <strong>💡 Try these sample questions:</strong>
            <span className="hint">Click to use</span>
          </div>
          <div className="questions-grid">
            {sampleQuestions.map((q, index) => (
              <div 
                key={index} 
                className="question-card"
                onClick={() => setQuestion(q)}
                tabIndex={0}
                onKeyPress={(e) => e.key === 'Enter' && setQuestion(q)}
              >
                <div className="question-text">{q}</div>
                <div className="click-hint">Click to use →</div>
              </div>
            ))}
          </div>
        </div>

        {/* --- Answer Display Section --- */}
        <div className="answer-section">
          {loading && (
            <div className="loader" role="status" aria-label="Loading">
              <div className="loader-content">
                <div className="loader-spinner"></div>
                <div className="loader-text">
                  <p>🔍 Searching agricultural databases...</p>
                  <p>📊 Analyzing climate patterns...</p>
                  <p>🌱 Generating insights...</p>
                </div>
              </div>
            </div>
          )}
          
          {error && (
            <div className="error-message" role="alert">
              <div className="error-icon">⚠️</div>
              <div className="error-content">
                <strong>Unable to process request</strong>
                <p>{error}</p>
                <button 
                  onClick={() => setError(null)} 
                  className="dismiss-error"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {answer && (
            <div className="answer-card">
              <div className="answer-header">
                <h2>✅ Data-Backed Answer</h2>
                <div className="answer-meta">Generated from trusted sources</div>
              </div>
              
              <div className="answer-content">
                <div className="answer-text">
                  {answer.answer}
                </div>

                {/* --- Traceability/Source Citation --- */}
                <div className="sources-list">
                  <h3>📚 Sources Cited</h3>
                  <div className="sources-grid">
                    {answer.sources && answer.sources.length > 0 ? (
                      answer.sources.map((source, index) => (
                        <div key={index} className="source-card">
                          <div className="source-name">{source.name}</div>
                          <a 
                            href={source.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="source-link"
                          >
                            View Source ↗
                          </a>
                        </div>
                      ))
                    ) : (
                      <div className="no-sources">No specific sources cited for this answer.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- Footer --- */}
      <footer className="app-footer">
        <div className="footer-content">
          <p>🌱 Designed for farmers and rural communities - Accessible, Voice-Enabled, Data-Driven</p>
          <div className="footer-links">
            <span>Powered by data.gov.in</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
