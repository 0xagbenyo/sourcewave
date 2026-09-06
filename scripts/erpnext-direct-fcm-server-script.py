# ERPNext Server Script — Raven Message → After Insert
# Paste ONLY lines between # START and # END into the Script field.
# No imports. No jwt. Will NOT break message sending (except: pass).

# START
try:
    message_type = getattr(doc, "message_type", None)
    channel_id = getattr(doc, "channel_id", None)
    if message_type != "System" and channel_id:
        is_dm = frappe.db.get_value("Raven Channel", channel_id, "is_direct_message")
        channel_name = frappe.db.get_value("Raven Channel", channel_id, "channel_name") or ""
        members = frappe.get_all(
            "Raven Channel Member",
            filters={"channel_id": channel_id},
            fields=["user_id", "allow_notifications"],
        )
        recipients = []
        for m in members:
            uid = m.get("user_id")
            if not uid or uid == doc.owner:
                continue
            if is_dm or m.get("allow_notifications") == 1:
                recipients.append(uid)
        if recipients:
            owner_name = frappe.db.get_value("User", doc.owner, "full_name") or doc.owner
            body = frappe.utils.strip_html(doc.content or "") or "New message"
            if len(body) > 240:
                body = body[:240]
            title = owner_name
            if not is_dm:
                title = owner_name + " in #" + channel_name
            for user in recipients:
                rows = frappe.get_all(
                    "Raven Push Token",
                    filters={"user": user, "environment": "Mobile"},
                    fields=["fcm_token"],
                )
                seen = []
                for row in rows:
                    t = (row.get("fcm_token") or "").strip()
                    if not t or t in seen:
                        continue
                    if not t.startswith("ExponentPushToken"):
                        continue
                    seen.append(t)
                    frappe.make_post_request(
                        "https://exp.host/--/api/v2/push/send",
                        headers={
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                        },
                        json={
                            "to": t,
                            "title": title,
                            "body": body,
                            "sound": "default",
                            "priority": "high",
                            "channelId": "raven-chat",
                        },
                    )
except Exception:
    pass
# END
