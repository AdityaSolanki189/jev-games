import { config } from '@/lib/config/server'
import { Resend } from 'resend'

function getResend() {
    const key = process.env.RESEND_API_KEY
    if (!key) {
        return null
    }
    return new Resend(key)
}

export async function sendEmail({
    to,
    subject,
    text,
    html,
    react,
}: {
    to: string
    subject: string
    text?: string
    html?: string
    react?: React.ReactElement
}) {
    const resend = getResend()
    if (!resend) {
        console.warn('Email disabled: RESEND_API_KEY is not set')
        return { data: null, error: new Error('Email disabled') }
    }

    try {
        return await resend.emails.send({
            from: `${config.app.name} <noreply@${process.env.NEXT_PUBLIC_EMAIL_DOMAIN ?? 'example.com'}>`,
            to,
            subject,
            text,
            html,
            react,
        })
    } catch (error) {
        console.error('Error sending email:', error)
        throw error
    }
}
