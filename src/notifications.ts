// Notificaciones push web

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function sendLocalNotification(title: string, body: string, icon = '/icons/icon-192.png') {
  if (Notification.permission !== 'granted') return;
  new Notification(title, { body, icon, badge: '/icons/icon-192.png' });
}

export function checkBudgetAlerts(
  budgets: { category: string; limit: number }[],
  transactions: { type: string; category: string; amount: number; date: string }[],
) {
  const today = new Date();
  const currentMonthTxs = transactions.filter(t => {
    const [y, m] = t.date.split('-').map(Number);
    return y === today.getFullYear() && m === today.getMonth() + 1;
  });

  for (const budget of budgets) {
    const spent = currentMonthTxs
      .filter(t => t.type === 'gasto' && t.category === budget.category)
      .reduce((s, t) => s + t.amount, 0);

    const pct = budget.limit > 0 ? (spent / budget.limit) * 100 : 0;

    if (pct >= 100) {
      sendLocalNotification(
        `⚠️ Presupuesto superado: ${budget.category}`,
        `Gastaste $${spent.toLocaleString()} de $${budget.limit.toLocaleString()} este mes.`,
      );
    } else if (pct >= 80) {
      sendLocalNotification(
        `🔔 Presupuesto al ${Math.round(pct)}%: ${budget.category}`,
        `Te quedan $${(budget.limit - spent).toLocaleString()} este mes.`,
      );
    }
  }
}
