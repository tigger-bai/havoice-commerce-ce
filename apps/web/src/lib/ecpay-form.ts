export function submitEcpayForm(
  actionUrl: string,
  payload: Record<string, string>,
  documentRef: Document = document,
): HTMLFormElement {
  const entries = Object.entries(payload);

  if (!actionUrl || entries.length === 0) {
    throw new Error('ECPay payment form data is incomplete');
  }

  const form = documentRef.createElement('form');
  form.method = 'POST';
  form.action = actionUrl;

  entries.forEach(([name, value]) => {
    const input = documentRef.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  documentRef.body.appendChild(form);
  form.submit();

  return form;
}
