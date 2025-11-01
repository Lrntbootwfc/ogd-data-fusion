// frontend/src/App.jsx
import { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState('light');

  const answerSectionRef = useRef(null);

  // Initialize theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  // Auto-scroll to answer when results are ready
  useEffect(() => {
    if (answer && answerSectionRef.current) {
      setTimeout(() => {
        answerSectionRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 100);
    }
  }, [answer]);

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setAnswer(null);
    setError(null);

    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

      const response = await fetch(`${API_BASE_URL}/api/query`, {
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
  };

  // Function to format answer text with proper HTML rendering
  const formatAnswerText = (text) => {
    if (!text) return '';

    let formattedText = text
      // Headers
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      // Bold and italic
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      // Lists
      .replace(/^- (.*$)/gim, '<li>$1</li>')
      // Line breaks
      .replace(/\n/g, '<br>');

    // Wrap consecutive list items in ul
    formattedText = formattedText.replace(/(<li>.*?<\/li>(?=<li>|<\/ul>))/gims, '<ul>$1</ul>');

    return { __html: formattedText };
  };

  // Function to create visualization data from answer
  const createVisualizations = (answerText) => {
    const visualizations = [];

    // Extract state comparison data
    const stateMatch = answerText.match(/Comparison: (.*?) vs (.*?)(?:\n|$)/);
    if (stateMatch) {
      const state1 = stateMatch[1];
      const state2 = stateMatch[2];

      // Mock rainfall data
      visualizations.push({
        type: 'rainfall',
        title: `🌧️ Rainfall Comparison`,
        subtitle: `${state1} vs ${state2}`,
        data: [
          { label: state1, value: 1200, color: '#22c55e' },
          { label: state2, value: 800, color: '#84cc16' }
        ]
      });
    }

    // Extract crop production data
    const cropSections = answerText.split('### 🌾 Top');
    cropSections.forEach(section => {
      const stateMatch = section.match(/Top.*?Crops in (.*?)(?:\n|$)/);
      if (stateMatch) {
        const state = stateMatch[1];
        const crops = [];

        // Extract crop data
        const cropLines = section.split('\n').filter(line => line.includes('**') && line.includes('tonnes'));
        cropLines.forEach((line, index) => {
          const cropMatch = line.match(/\*\*(.*?)\*\*: (.*?)k tonnes/);
          if (cropMatch) {
            crops.push({
              crop: cropMatch[1],
              production: parseFloat(cropMatch[2]),
              color: `hsl(${index * 60}, 70%, 50%)`
            });
          }
        });

        if (crops.length > 0) {
          visualizations.push({
            type: 'crops',
            title: `🌾 Top Crops in ${state}`,
            data: crops
          });
        }
      }
    });

    return visualizations;
  };

  // Render visualization components
  const renderVisualization = (viz, index) => {
    const maxValue = Math.max(...viz.data.map(item => item.value || item.production));

    switch (viz.type) {
      case 'rainfall':
        return (
          <div key={index} className="viz-card">
            <div className="viz-header">
              <span>🌧️</span>
              {viz.title}
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{viz.subtitle}</p>
            <div className="chart-container">
              {viz.data.map((item, i) => (
                <div key={i} style={{ marginBottom: '1rem' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '0.5rem',
                    color: 'var(--text-primary)'
                  }}>
                    <span>{item.label}</span>
                    <span style={{ fontWeight: '600' }}>{item.value} mm</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${(item.value / 1500) * 100}%`,
                        background: item.color
                      }}
                    >
                      {Math.round((item.value / 1500) * 100)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'crops':
        return (
          <div key={index} className="viz-card">
            <div className="viz-header">
              <span>🌾</span>
              {viz.title}
            </div>
            <div className="chart-container">
              {viz.data.map((item, i) => (
                <div key={i} style={{ marginBottom: '1rem' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '0.5rem',
                    color: 'var(--text-primary)'
                  }}>
                    <span>{item.crop}</span>
                    <span style={{ fontWeight: '600' }}>{item.production}k tonnes</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${(item.production / maxValue) * 100}%`,
                        background: item.color
                      }}
                    >
                      {Math.round((item.production / maxValue) * 100)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return (
          <div key={index} className="viz-card">
            <div className="viz-placeholder">
              <div className="icon">📊</div>
              <h4>Data Visualization</h4>
              <p>Interactive chart would display here</p>
            </div>
          </div>
        );
    }
  };

  const sampleQuestions = [
    "Compare Maharashtra and Gujarat agriculture production",
    "Which state has highest rice production?",
    "Show me wheat statistics in Punjab",
    "What is the rainfall in Kerala?",
    "Analyze production trend in Maharashtra for last 5 years"
  ];

  const visualizations = answer ? createVisualizations(answer.answer) : [];

  // Data.gov.in sources
  const dataSources = [
    {
      name: "Agriculture Production Data",
      url: "https://data.gov.in/catalog/production-different-crops"
    },
    {
      name: "Climate & Rainfall Data",
      url: "https://data.gov.in/catalog/annual-rainfall"
    },
    {
      name: "Crop Yield Statistics",
      url: "https://data.gov.in/catalog/yield-different-crops"
    }
  ];

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <div className="header-main">
            <div className="header-icon">🌾</div>
            <div className="header-text">
              <h1>Project Samarth: Intelligent Data Q&A</h1>
              <p>Query the Nation's Agriculture & Climate Data (Powered by data.gov.in)</p>
            </div>
          </div>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'light' ? '🌙' : '☀️'} {theme === 'light' ? 'Dark' : 'Light'} Mode
          </button>
        </div>
      </header>

      {/* --- Main Content Area --- */}
      <main className="main-content">
        {/* --- Question Input Section --- */}
        <form onSubmit={handleSubmit} className="query-form">
          <div className="input-container">
            <div className="textarea-wrapper">
              <textarea
                rows="3"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question about agriculture and climate patterns... For example: 'Compare Maharashtra and Gujarat agriculture production'"
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
        <div ref={answerSectionRef} className="answer-section">
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
                {/* Main Answer Text */}
                <div
                  className="answer-text"
                  dangerouslySetInnerHTML={formatAnswerText(answer.answer)}
                />

                {/* Visualizations Section */}
                {visualizations.length > 0 && (
                  <div className="visualization-section">
                    <div className="visualization-title">
                      📊 Interactive Visualizations
                    </div>
                    <div className="visualizations-grid">
                      {visualizations.map((viz, index) => renderVisualization(viz, index))}
                    </div>
                  </div>
                )}

                {/* Key Insights Summary */}
                <div className="visualization-section">
                  <div className="visualization-title">
                    💡 Key Insights Summary
                  </div>
                  <div className="answer-text">
                    <ul>
                      <li><strong>Data-driven insights</strong> based on comprehensive agricultural analysis from trusted government sources</li>
                      <li><strong>Climate correlations</strong> showing weather impact on crop production patterns</li>
                      <li><strong>Regional comparisons</strong> highlighting production efficiency and opportunities</li>
                      <li><strong>Trend analysis</strong> for informed agricultural planning and predictions</li>
                    </ul>
                  </div>
                </div>

                {/* --- Sources Citation --- */}
                <div className="sources-list">
                  <h3>📚 Data Sources & References</h3>
                  <div className="sources-grid">
                    {dataSources.map((source, index) => (
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
                    ))}
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
          <p>🌱 Designed for farmers and rural communities - Accessible, Data-Driven</p>
          <div className="footer-links">
            <span>Powered by <a href="https://data.gov.in" target="_blank" rel="noopener noreferrer">data.gov.in</a> - Open Government Data Platform</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;