/** Format ISO instant in a trip IANA timezone. */
export function formatInZone(
  iso: string | null | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
  },
): string {
  if (!iso) {
    return ''
  }
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(new Date(iso))
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(iso))
  }
}

export function dayKeyInZone(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) {
    return null
  }
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toISOString().slice(0, 10)
  }
}

export function formatDayLabel(dayKey: string, timeZone: string): string {
  try {
    const date = new Date(`${ dayKey }T12:00:00Z`)
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(date)
  } catch {
    return dayKey
  }
}

/** Value for <input type="datetime-local"> from ISO. */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) {
    return ''
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return ''
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${ d.getFullYear() }-${ pad(d.getMonth() + 1) }-${ pad(d.getDate()) }T${ pad(d.getHours()) }:${ pad(d.getMinutes()) }`
}

/** ISO from datetime-local value (interpreted as local). */
export function fromDatetimeLocalValue(value: string): string | null {
  if (!value) {
    return null
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    return null
  }
  return d.toISOString()
}

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) {
    return 'Dates TBD'
  }
  if (start && end && start !== end) {
    return `${ start } – ${ end }`
  }
  return start ?? end ?? ''
}
