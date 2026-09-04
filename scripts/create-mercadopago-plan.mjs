const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
const amount = Number(process.env.LABOVET_MONTHLY_PRICE);
const backUrl = process.env.NEXT_PUBLIC_APP_URL;
if (!token || !amount || !backUrl) throw new Error("Definí MERCADOPAGO_ACCESS_TOKEN, LABOVET_MONTHLY_PRICE y NEXT_PUBLIC_APP_URL");
const response = await fetch("https://api.mercadopago.com/preapproval_plan", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    reason: "LabOVet Planillas SIGATM",
    back_url: backUrl,
    auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: amount, currency_id: "ARS", free_trial: { frequency: 30, frequency_type: "days" } },
  }),
});
if (!response.ok) throw new Error(`Mercado Pago ${response.status}: ${await response.text()}`);
const plan = await response.json();
console.log(`Plan creado. Guardá este valor como MERCADOPAGO_PLAN_ID: ${plan.id}`);
