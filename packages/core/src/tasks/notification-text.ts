/*
 * Text and links of task notifications. Notifications are stored as plain text (one language,
 * German, the company's working language), so the strings live here and are shared by the web
 * services and the nightly carry-over job, not in the UI message files.
 */

/** App-relative link that opens the task drawer on the right board. */
export function taskLink(taskId: string, eventId: string | null): string {
  const query = `?aufgabe=${taskId}`;
  return eventId ? `/veranstaltungen/${eventId}/board${query}` : `/board${query}`;
}

type Subject = { title: string; eventName: string | null };

const where = (s: Subject) => (s.eventName ? ` (${s.eventName})` : "");

export function assignedText(s: Subject, by: string) {
  return {
    title: `Neue Aufgabe: ${s.title}`,
    body: `${by} hat dir die Aufgabe zugewiesen${where(s)}.`,
  };
}

export function mentionedText(s: Subject, by: string) {
  return {
    title: `${by} hat dich erwähnt`,
    body: `In der Aufgabe „${s.title}“${where(s)}.`,
  };
}

export function rolledOverText(s: Subject, count: number) {
  return {
    title: `Übertragen: ${s.title}`,
    body:
      count === 1
        ? `Die Aufgabe${where(s)} war gestern fällig und ist noch offen.`
        : `Die Aufgabe${where(s)} wurde jetzt ${count}× übertragen und ist noch offen.`,
  };
}

export function escalatedText(s: Subject, count: number, assignee: string | null) {
  return {
    title: `${count}× übertragen: ${s.title}`,
    body: `${assignee ? `${assignee} hat` : "Niemand hat"} die Aufgabe${where(s)} ${count}× nicht abgeschlossen.`,
  };
}
