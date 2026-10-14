"""Stops spending when the budget reaches the kill line. Triggered by the budget's Pub/Sub topic.
It removes billing from the project: Cloud Run and Vertex AI then stop and no more credit is used. Nothing is deleted.
To start again, link billing back:  gcloud billing projects link PROJECT --billing-account=ACCOUNT
The kill line is KILL_PERCENT of the budget (0.9 by default). Cost reports arrive a few hours late, so the margin below 100% keeps us under the cap."""
import base64, json, os

import functions_framework
from google.cloud import billing_v1

PROJECT = os.environ["TARGET_PROJECT"]
KILL_PERCENT = float(os.environ.get("KILL_PERCENT", "0.9"))


@functions_framework.cloud_event
def stop_billing(event):
    try:
        msg = json.loads(base64.b64decode(event.data["message"]["data"]).decode("utf-8"))
        cost, budget = float(msg.get("costAmount", 0)), float(msg.get("budgetAmount", 0))
    except Exception as e:   # an unreadable message must not be retried for days
        print(f"ignored an unreadable message: {type(e).__name__}")
        return
    print(f"budget message: cost={cost} budget={budget} currency={msg.get('currencyCode')}")
    if budget <= 0 or cost < KILL_PERCENT * budget:
        print("under the kill line: nothing to do")
        return
    client = billing_v1.CloudBillingClient()
    name = f"projects/{PROJECT}"
    info = client.get_project_billing_info(name=name)
    if not info.billing_enabled:
        print("billing is already off")
        return
    client.update_project_billing_info(name=name, project_billing_info=billing_v1.ProjectBillingInfo(billing_account_name=""))
    print(f"BILLING REMOVED from {PROJECT}: cost {cost} reached {KILL_PERCENT:.0%} of the {budget} budget")
