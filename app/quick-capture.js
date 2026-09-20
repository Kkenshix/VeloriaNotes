'use strict';
const text = document.getElementById('text');
async function send() {
  const value = String(text.value || '').trim();
  if (!value) return;
  await window.quickVeloria.submit(value, 'note');
}
document.getElementById('save').addEventListener('click', send);
document.getElementById('close').addEventListener('click', () => window.quickVeloria.close());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.quickVeloria.close();
  if (event.ctrlKey && event.key === 'Enter') send();
});
