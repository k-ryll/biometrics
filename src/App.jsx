import { useState, useCallback } from 'react'
import { parseBiometricLog } from './parseBiometricLog'
import './App.css'

function formatDate(dateKey) {
  const [y, m, d] = dateKey.split('-')
  return `${m}/${d}/${y}`
}

function App() {
  const [dtrRows, setDtrRows] = useState([])
  const [error, setError] = useState('')

  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    const ext = (file.name || '').toLowerCase()
    if (!/\.(txt|dat|log|csv)$/.test(ext)) {
      setError('Use .txt, .dat, .log, or .csv')
      setDtrRows([])
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = reader.result ?? ''
        const rows = parseBiometricLog(text)
        setDtrRows(rows)
        if (rows.length === 0) setError('No valid rows parsed. Check file format.')
      } catch (err) {
        setError(err?.message ?? 'Parse error')
        setDtrRows([])
      }
    }
    reader.onerror = () => {
      setError('Failed to read file')
      setDtrRows([])
    }
    reader.readAsText(file, 'UTF-8')
  }, [])

  return (
    <div className="dtr-app">
      <h1>DTR – Biometric Log</h1>
      <label className="file-label">
        <input type="file" accept=".txt,.dat,.log,.csv" onChange={handleFile} />
        Upload .txt / .dat / .log
      </label>
      {error && <p className="error">{error}</p>}
      {dtrRows.length > 0 && (
        <div className="table-wrap">
          <table className="dtr-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Name</th>
                <th>No.</th>
                <th>Date</th>
                <th>Time In</th>
                <th>Lunch Start</th>
                <th>Lunch End</th>
                <th>Time Out</th>
                <th>Total Working Time</th>
                <th>Total Lunch Time</th>
              </tr>
            </thead>
            <tbody>
              {dtrRows.map((row, i) => (
                <tr key={`${row.department}-${row.name}-${row.no}-${row.date}-${i}`}>
                  <td>{row.department}</td>
                  <td>{row.name}</td>
                  <td>{row.no}</td>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.timeIn}</td>
                  <td>{row.lunchStart}</td>
                  <td>{row.lunchEnd}</td>
                  <td>{row.timeOut}</td>
                  <td>{row.totalWorkingTime ?? '—'}</td>
                  <td>{row.totalLunchTime ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default App
