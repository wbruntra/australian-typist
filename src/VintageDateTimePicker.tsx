import { useEffect, useRef, useState } from "react";

interface VintageDateTimePickerProps {
  value: number; // timestamp in ms
  onChange: (newValue: number) => void;
  minTime: number; // min timestamp in ms
  maxTime: number; // max timestamp in ms
}

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
];

const DAYS_OF_WEEK = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function VintageDateTimePicker({
  value,
  onChange,
  minTime,
  maxTime
}: VintageDateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse the current value into state
  const currentDate = new Date(value);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth());
  const [selectedDay, setSelectedDay] = useState(currentDate.getDate());
  const [selectedHour, setSelectedHour] = useState(currentDate.getHours());
  const [selectedMinute, setSelectedMinute] = useState(currentDate.getMinutes());

  // Keep internal selection in sync when value changes externally
  useEffect(() => {
    const d = new Date(value);
    setSelectedYear(d.getFullYear());
    setSelectedMonth(d.getMonth());
    setSelectedDay(d.getDate());
    setSelectedHour(d.getHours());
    setSelectedMinute(d.getMinutes());
  }, [value, isOpen]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Calculations for calendar grid
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(selectedYear, selectedMonth, 1).getDay();

  // Commit changes to parent
  const handleCommit = (y = selectedYear, m = selectedMonth, d = selectedDay, h = selectedHour, min = selectedMinute) => {
    const newDate = new Date(y, m, d, h, min, 0);
    let newTime = newDate.getTime();
    
    // Clamp to min/max
    if (newTime < minTime) newTime = minTime;
    if (newTime > maxTime) newTime = maxTime;

    onChange(newTime);
  };

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(y => y - 1);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(y => y + 1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  const handlePrevYear = () => {
    setSelectedYear(y => y - 1);
  };

  const handleNextYear = () => {
    setSelectedYear(y => y + 1);
  };

  const adjustHour = (delta: number) => {
    let nextHour = (selectedHour + delta) % 24;
    if (nextHour < 0) nextHour += 24;
    setSelectedHour(nextHour);
    handleCommit(selectedYear, selectedMonth, selectedDay, nextHour, selectedMinute);
  };

  const adjustMinute = (delta: number) => {
    let nextMin = (selectedMinute + delta) % 60;
    if (nextMin < 0) nextMin += 60;
    setSelectedMinute(nextMin);
    handleCommit(selectedYear, selectedMonth, selectedDay, selectedHour, nextMin);
  };

  // Format the active date text for the trigger display
  const formatTriggerText = () => {
    const d = new Date(value);
    const month = MONTHS[d.getMonth()]!.slice(0, 3);
    const day = String(d.getDate()).padStart(2, "0");
    const year = d.getFullYear();
    const hour = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${month} ${day}, ${year} ${hour}:${min}`;
  };

  // Render days array
  const dayElements = [];
  // Leading empty slots
  for (let i = 0; i < firstDayOfWeek; i++) {
    dayElements.push(<div key={`empty-${i}`} className="calendar-day-empty" />);
  }
  // Days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const thisDate = new Date(selectedYear, selectedMonth, day, selectedHour, selectedMinute, 0);
    const isDisabled = thisDate.getTime() < minTime || thisDate.getTime() > maxTime;
    const isSelected = day === selectedDay;

    dayElements.push(
      <button
        key={`day-${day}`}
        disabled={isDisabled}
        onClick={() => {
          setSelectedDay(day);
          handleCommit(selectedYear, selectedMonth, day, selectedHour, selectedMinute);
        }}
        className={`calendar-day-btn${isSelected ? " stamped-active" : ""}${isDisabled ? " disabled" : ""}`}
      >
        <span>{day}</span>
      </button>
    );
  }

  return (
    <div className="vintage-picker-container" ref={containerRef}>
      <button
        type="button"
        className="vintage-picker-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="picker-icon">📅</span>
        <span className="picker-value">{formatTriggerText()}</span>
        <span className="picker-arrow">▾</span>
      </button>

      {isOpen && (
        <div className="vintage-picker-popover">
          <div className="vintage-calendar-card">
            {/* Year & Month Selection */}
            <div className="vintage-calendar-selectors">
              <div className="selector-row">
                <button type="button" className="typewriter-key small" onClick={handlePrevMonth}>◀</button>
                <span className="selector-label">{MONTHS[selectedMonth]}</span>
                <button type="button" className="typewriter-key small" onClick={handleNextMonth}>▶</button>
              </div>
              <div className="selector-row">
                <button type="button" className="typewriter-key small" onClick={handlePrevYear}>◀</button>
                <span className="selector-label">{selectedYear}</span>
                <button type="button" className="typewriter-key small" onClick={handleNextYear}>▶</button>
              </div>
            </div>

            {/* Days of week header */}
            <div className="calendar-week-header">
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="week-day">{d}</div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="calendar-days-grid">
              {dayElements}
            </div>

            {/* Separator rule */}
            <hr className="vintage-card-rule" />

            {/* Time selection dials */}
            <div className="vintage-time-title">SET TIME</div>
            <div className="vintage-time-selector">
              <div className="time-dial">
                <button type="button" className="typewriter-key small" onClick={() => adjustHour(1)}>▲</button>
                <div className="dial-value">{String(selectedHour).padStart(2, "0")}</div>
                <button type="button" className="typewriter-key small" onClick={() => adjustHour(-1)}>▼</button>
                <span className="dial-label">HR</span>
              </div>
              <div className="time-colon">:</div>
              <div className="time-dial">
                <button type="button" className="typewriter-key small" onClick={() => adjustMinute(1)}>▲</button>
                <div className="dial-value">{String(selectedMinute).padStart(2, "0")}</div>
                <button type="button" className="typewriter-key small" onClick={() => adjustMinute(-1)}>▼</button>
                <span className="dial-label">MIN</span>
              </div>
            </div>

            {/* Footer stamp button */}
            <div className="vintage-picker-footer">
              <button
                type="button"
                className="vintage-picker-commit-btn"
                onClick={() => setIsOpen(false)}
              >
                STAMP TIMELINE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
