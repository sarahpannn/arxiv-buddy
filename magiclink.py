import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_email(to_email, from_email, subject="Test Email", body="Test message", no_reply=True):
    # AWS SES SMTP server for us-west-2 region
    server_name = 'email-smtp.us-west-2.amazonaws.com'
    username = os.environ['SES_SMTP_USER']
    password = os.environ['SES_SMTP_PASS']
    
    msg = MIMEMultipart()
    msg['From'] = from_email
    msg['To'] = to_email
    if no_reply: subject = "[No Reply] " + subject
    msg['Subject'] = subject
    
    if no_reply: body += "\n\nThis email was sent from a notification-only address that cannot accept replies. If you need assistance, please contact our support team at help@answer.ai"
    msg.attach(MIMEText(body, 'plain'))
    
    with smtplib.SMTP(server_name, 587) as server:
        server.starttls()
        server.login(username, password)
        server.send_message(msg)
    
    auth_id = os.urandom(16).hex()  # Generate a random auth ID

    return auth_id


# auth_ids = {}

# def login():
#   if device_enrolled():
#     if passkey_success(): return True
#   # device not enrolled or passkey failed
#   email = get_email_address() # this needs to be written by them
#   auth_id = send_auth_email(email)

# def email_cb(auth_id:str):
#   if auth_id not in auth_ids: return False
#   return True