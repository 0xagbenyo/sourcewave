# ERPNext Server Script — Raven Message → After Insert
#
# Setup:
#   DocType: Raven Message | Event: After Insert | Enabled: Yes
# Paste ONLY lines between # START and # END into the Script field.
#
# Notes:
#   - Flat inline code only (no def/functions — causes HTTP 500)
#   - json= payload on make_post_request (Expo requires JSON body)
#   - Optional: remove "Raven Expo Push Response" log_error once stable

# START
try:
    message_type = doc.get("message_type")
    channel_id = doc.get("channel_id")

    if message_type != "System" and channel_id:

        is_dm = frappe.db.get_value(
            "Raven Channel",
            channel_id,
            "is_direct_message"
        )

        channel_name = frappe.db.get_value(
            "Raven Channel",
            channel_id,
            "channel_name"
        ) or ""

        members = frappe.get_all(
            "Raven Channel Member",
            filters={
                "channel_id": channel_id
            },
            fields=[
                "user_id",
                "allow_notifications"
            ]
        )

        recipients = []

        for member in members:

            user_id = member.get("user_id")

            if not user_id:
                continue

            if user_id == doc.owner:
                continue

            if is_dm:
                if user_id not in recipients:
                    recipients.append(user_id)

            elif member.get("allow_notifications") == 1:
                if user_id not in recipients:
                    recipients.append(user_id)

        if recipients:

            owner_name = frappe.db.get_value(
                "User",
                doc.owner,
                "full_name"
            ) or doc.owner

            content = doc.get("content") or ""

            body = frappe.utils.strip_html(content)

            if not body:
                body = "New message"

            if len(body) > 240:
                body = body[:237] + "..."

            title = owner_name

            if not is_dm and channel_name:
                title = owner_name + " in #" + channel_name

            sent = 0

            for user in recipients:

                user_ids = []

                if user:
                    user_ids.append(user)

                    if "@" in user:

                        alt_user = frappe.db.get_value(
                            "User",
                            {"email": user},
                            "name"
                        )

                        if alt_user and alt_user not in user_ids:
                            user_ids.append(alt_user)

                    else:

                        alt_email = frappe.db.get_value(
                            "User",
                            user,
                            "email"
                        )

                        if alt_email and alt_email not in user_ids:
                            user_ids.append(alt_email)

                if not user_ids:
                    continue

                rows = frappe.get_all(
                    "Raven Push Token",
                    filters={
                        "user": [
                            "in",
                            user_ids
                        ],
                        "environment": "Mobile"
                    },
                    fields=[
                        "fcm_token"
                    ]
                )

                seen_tokens = []

                for row in rows:

                    token = (
                        row.get("fcm_token") or ""
                    ).strip()

                    if not token:
                        continue

                    if token in seen_tokens:
                        continue

                    if not (
                        token.startswith("ExponentPushToken")
                        or token.startswith("ExpoPushToken")
                    ):
                        continue

                    seen_tokens.append(token)

                    try:

                        payload = {
                            "to": token,
                            "title": title,
                            "body": body,
                            "sound": "default",
                            "priority": "high",
                            "channelId": "raven-chat"
                        }

                        response = frappe.make_post_request(
                            url="https://exp.host/--/api/v2/push/send",
                            headers={
                                "Accept": "application/json",
                                "Content-Type": "application/json"
                            },
                            json=payload
                        )

                        sent = sent + 1

                        frappe.log_error(
                            title="Raven Expo Push Response",
                            message=str(response)[:1000]
                        )

                    except Exception as push_error:

                        frappe.log_error(
                            title="Raven Expo Push Error",
                            message=str(push_error)[:1000]
                        )

            if sent == 0:

                frappe.log_error(
                    title="Raven Expo Push",
                    message=(
                        "No successful Expo push. "
                        + "Recipients: "
                        + frappe.as_json(recipients)
                    )
                )

except Exception as e:

    frappe.log_error(
        title="Raven Push Notification Error",
        message=str(e)[:1000]
    )
# END
