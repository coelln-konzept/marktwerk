"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { NativeSelect } from "./native-select";

/**
 * Filters live in the URL, so a filter form is a GET form that navigates client-side instead of
 * reloading the document (scroll position and focus stay, and the URL carries no empty params).
 * Returns the URL a GET submit of `form` would load, or `null` when it is not same-origin.
 */
function filterUrl(form: HTMLFormElement, submitter?: HTMLElement | null): string | null {
  const target = new URL(
    form.getAttribute("action") || window.location.pathname,
    window.location.href,
  );
  if (target.origin !== window.location.origin) return null;
  const params = new URLSearchParams();
  for (const [key, value] of new FormData(form, submitter)) {
    // Files cannot be filters; empty values ("?q=&saison=") are the same as no filter.
    if (typeof value === "string" && value !== "") params.append(key, value);
  }
  const query = params.toString();
  return query ? `${target.pathname}?${query}` : target.pathname;
}

/**
 * A <select> inside a GET form that submits on change (filters live in the URL).
 *
 * Besides the change, it makes the *whole form* navigate client-side: pressing Enter in a search
 * field of the same form no longer reloads the page either (the form needs at least one of these
 * selects, no page change required). After a navigation the select shows the URL's value again
 * (`defaultValue` is only read on mount, so we re-apply it), e.g. after "Filter zurücksetzen".
 */
export function AutoSubmitSelect({
  wrapperClassName,
  onChange,
  ...props
}: React.ComponentProps<"select"> & { wrapperClassName?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLSelectElement>(null);

  const submit = (form: HTMLFormElement, submitter?: HTMLElement | null) => {
    const url = filterUrl(form, submitter);
    if (url === null) {
      form.submit();
      return;
    }
    startTransition(() => router.replace(url as never, { scroll: false }));
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // Enter in a search input of the same form takes the same client-side path as the select.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onSubmit = (event: SubmitEvent) => {
      if (event.defaultPrevented) return;
      if ((form.method || "get").toLowerCase() !== "get") return;
      event.preventDefault();
      // With several selects in one form, the first listener handles the event.
      event.stopImmediatePropagation();
      submitRef.current(form, event.submitter);
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  // The form reads as busy while the server answers.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    if (pending) form.setAttribute("aria-busy", "true");
    else form.removeAttribute("aria-busy");
  }, [pending]);

  // Uncontrolled select: React ignores a changed `defaultValue` after mount, so a client navigation
  // (reset link, focus chip) left the old choice showing (A5-01). Re-apply the URL's value after each
  // render of the page. Not keyed on the value: a remount would drop focus. Skipped while a navigation
  // is pending, otherwise the select would jump back to the old value before the new URL arrives.
  useEffect(() => {
    const select = ref.current;
    if (pending || !select || props.defaultValue === undefined || props.defaultValue === null) {
      return;
    }
    const value = String(props.defaultValue);
    if (select.value !== value) select.value = value;
  });

  // The same for the form's text inputs (search box): after "Filter zurücksetzen" the URL has no `q`
  // any more but the box still showed the old text. React keeps the DOM `defaultValue` in step with the
  // page's `defaultValue` prop, so a changed URL value is visible there. Only a *change* of it re-syncs,
  // and never into a focused box: text typed but not submitted yet survives unrelated re-renders.
  const seenDefaults = useRef(new WeakMap<HTMLInputElement, string>());
  useEffect(() => {
    const form = ref.current?.form;
    if (pending || !form) return;
    for (const el of form.elements) {
      if (!(el instanceof HTMLInputElement) || !/^(text|search)$/.test(el.type)) continue;
      const before = seenDefaults.current.get(el);
      seenDefaults.current.set(el, el.defaultValue);
      if (before === undefined || before === el.defaultValue) continue;
      if (document.activeElement !== el && el.value !== el.defaultValue) el.value = el.defaultValue;
    }
  });

  return (
    <NativeSelect
      {...props}
      ref={ref}
      onChange={(event) => {
        onChange?.(event);
        const form = event.currentTarget.form;
        if (form) submit(form);
      }}
    />
  );
}
