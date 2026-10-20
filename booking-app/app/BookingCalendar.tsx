import { useState } from "react";
export function BookingCalendar({
  availability,
  onSelect,
  allowUnavailable = false,
}: {
  availability: { date: string; open: boolean }[];
  onSelect?: (date: string) => void;
  allowUnavailable?: boolean;
}) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [selected, setSelected] = useState("");
  const start = new Date(month + "-01T00:00:00Z"),
    days = new Date(
      start.getUTCFullYear(),
      start.getUTCMonth() + 1,
      0,
    ).getUTCDate(),
    map = new Map(availability.map((a) => [a.date, a.open]));
  function move(n: number) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  }
  return (
    <section aria-label="Wedding date availability" style={{ maxWidth: 550 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Previous month"
          disabled={month <= (availability[0]?.date.slice(0,7) || month)}
        >
          ‹
        </button>
        <h3>
          {start.toLocaleDateString("en", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </h3>
        <button type="button" onClick={() => move(1)} aria-label="Next month" disabled={month >= (availability[availability.length-1]?.date.slice(0,7) || month)}>
          ›
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 6,
        }}
      >
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d}>{d}</span>
        ))}
        {Array.from({ length: start.getUTCDay() }, (_, i) => (
          <span key={"blank" + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = month + "-" + String(i + 1).padStart(2, "0"),
            open = map.get(date) === true || (allowUnavailable && map.has(date));
          return (
            <button
              type="button"
              key={date}
              disabled={!open}
              aria-label={date + (allowUnavailable && open ? " request waitlist" : open ? " available" : " unavailable")}
              aria-pressed={selected === date}
              style={{
                padding: 12,
                background:
                  selected === date ? "#4A4B36" : open ? "#E7E5D9" : "#eee",
                color: selected === date ? "#fff" : "#4A4B36",
                border: "1px solid #D6D2BC",
              }}
              onClick={() => {
                setSelected(date);
                onSelect?.(date);
              }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <p>
        {allowUnavailable ? "Choose the date you would like us to review. This does not reserve a date." : "Available dates are selectable. Availability is checked again when you reserve."}
      </p>
    </section>
  );
}
