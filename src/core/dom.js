export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function formatTime(date = new Date(), seconds = false) {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', ...(seconds ? {second:'2-digit'} : {}) }).format(date);
}
export function formatDate(date = new Date(), options = {}) {
  return new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'long', ...options}).format(date);
}
export function mountTicker(root, render, interval = 1000) {
  render(root); const timer = setInterval(() => render(root), interval); return () => clearInterval(timer);
}
export function createElement(tag, className, text) {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text; return node;
}
