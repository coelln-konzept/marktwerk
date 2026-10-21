"use client";

/** A <select> inside a GET form that submits on change (filters live in the URL). */
export function AutoSubmitSelect(props: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className="min-h-(--control-h) rounded-lg border border-input bg-card px-3 py-1"
    />
  );
}
