export type GreetingPeriod = "morning" | "afternoon" | "evening";

const MORNING_START_HOUR = 5;
const AFTERNOON_START_HOUR = 12;
const EVENING_START_HOUR = 18;

export function getGreetingPeriod(date: Date): GreetingPeriod {
  const hour = date.getHours();

  const isMorning = hour >= MORNING_START_HOUR && hour < AFTERNOON_START_HOUR;
  if (isMorning) {
    return "morning";
  }

  const isAfternoon = hour >= AFTERNOON_START_HOUR && hour < EVENING_START_HOUR;
  if (isAfternoon) {
    return "afternoon";
  }

  return "evening";
}
