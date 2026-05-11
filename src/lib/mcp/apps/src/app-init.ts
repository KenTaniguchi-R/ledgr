export function initApp(onData: (data: unknown) => void) {
  window.addEventListener("message", (event) => {
    if (event.data?.type === "tool-input") {
      onData(event.data.data);
    }
  });

  if (window.parent !== window) {
    window.parent.postMessage({ type: "ready" }, "*");
  }
}
