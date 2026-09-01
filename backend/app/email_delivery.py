import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import parseaddr

from .config import get_settings

logger = logging.getLogger(__name__)


def send_email(*, recipient: str, subject: str, text: str, html: str) -> bool:
    """Deliver one transactional email without leaking its token into logs.

    A failed delivery is deliberately recoverable through the resend/forgot-password
    endpoints. Registration should not strand an account behind a transient SMTP error.
    """
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_from_email:
        return False

    message = EmailMessage()
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(text)
    message.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.ehlo()
            if settings.smtp_starttls:
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password or "")
            smtp.send_message(
                message,
                from_addr=parseaddr(settings.smtp_from_email)[1],
                to_addrs=[recipient],
            )
    except (OSError, smtplib.SMTPException):
        logger.exception("Transactional email delivery failed")
        return False
    return True
