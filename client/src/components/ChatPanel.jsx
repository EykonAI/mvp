import { useState, useRef, useEffect } from 'react'
import { API_URL } from '../config'
import './ChatPanel.css'

const WELCOME = `👋 I'm your geopolitical intelligence analyst.

Ask me about the vessels, aircraft, or conflict events on the map — or any broader geopolitical question.`

const SUGGESTIONS = [
  'What is AIS spoofing and why does it matter?',
  'Why is Red Sea vessel traffic strategically significant?',
  'Explain what dark shipping is',
  'What regions currently have the most conflict activity?',
  'How do sanctions affect maritime traffic patterns?'
]

function Message({ role, content }) {
  return (
    <div className={`msg msg-${role}`}>
      {role === 'assistant' && <div className="msg-avatar">AI</div>}
      <div className="msg-bubble">{content}</div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="msg msg-assistant">
      <div className="msg-avatar">AI</div>
      <div className="msg-bubble typing">
        <span /><span /><span />
      </div>
    </div>
  )
}

export default function ChatPanel() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: WELCOME }
  ])
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text) => {
    const content = (text || input).trim()
    if (!content || loading) return

    setInput('')
    setError(null)

    const newMessages = [...messages, { role: 'user', content }]
    setMessages(newMessages)
    setLoading(true)

    // Build API messages — skip the initial welcome message
    const apiMessages = newMessages
      .filter(m => !(m.role === 'assistant' && m.content === WELCOME))
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: apiMessages })
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        throw new Error(data.error || `Server error ${res.status}`)
      }

      const reply = data.content?.[0]?.text
      if (!reply) throw new Error('Empty response from Claude')

      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err.message)
      setMessages(m => [...m, {
        role:    'assistant',
        content: `⚠️  ${err.message}\n\nCheck that ANTHROPIC_API_KEY is set in your .env file.`
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-header-icon">🤖</span>
          <div>
            <div className="chat-title">Intelligence Assistant</div>
            <div className="chat-model">claude-sonnet-4-6</div>
          </div>
        </div>
        <div className="chat-status">
          <span className={`status-dot ${loading ? 'status-thinking' : 'status-ready'}`} />
          <span className="status-label">{loading ? 'Thinking…' : 'Ready'}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((m, i) => (
          <Message key={i} role={m.role} content={m.content} />
        ))}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Suggested questions */}
      <div className="chat-suggestions">
        <div className="suggestions-label">Suggested</div>
        <div className="suggestions-list">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              className="suggestion-btn"
              onClick={() => send(s)}
              disabled={loading}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-textarea"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about vessels, aircraft, conflicts…"
          disabled={loading}
          rows={2}
        />
        <button
          className="send-btn"
          onClick={() => send()}
          disabled={loading || !input.trim()}
          title="Send (Enter)"
        >
          ➤
        </button>
      </div>
    </div>
  )
}
