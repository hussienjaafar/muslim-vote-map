/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
  token?: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
  token,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Campaign Data Solutions password reset code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://campaigndata.solutions/logo-icon.png" alt="Campaign Data Solutions" width="48" height="48" style={logo} />
        <Heading style={h1}>Reset your password</Heading>
        <Text style={text}>
          Enter the code below on the password reset page to choose a new
          password. This code expires shortly.
        </Text>
        {token ? (
          <div style={codeBox}>
            <Text style={codeText}>{token}</Text>
          </div>
        ) : null}
        <Text style={smallText}>
          Or, if you prefer,{' '}
          <Link href={confirmationUrl} style={link}>
            click this link to reset your password
          </Link>
          .
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          If you didn't request a password reset, you can safely ignore this
          email. Your password will not be changed.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '20px 25px' }
const logo = { width: '48px', height: '48px', margin: '0 auto 10px', borderRadius: '8px', display: 'block' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0e1117', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#6b7280', lineHeight: '1.5', margin: '0 0 20px' }
const smallText = { fontSize: '13px', color: '#6b7280', lineHeight: '1.5', margin: '20px 0 0' }
const codeBox = { backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '20px', textAlign: 'center' as const, margin: '0 0 10px' }
const codeText = { fontSize: '32px', fontWeight: 'bold' as const, color: '#0e1117', letterSpacing: '8px', fontFamily: 'monospace', margin: 0 }
const link = { color: '#0ea5c9', textDecoration: 'underline' }
const hr = { borderColor: '#e5e7eb', margin: '30px 0 20px' }
const footer = { fontSize: '12px', color: '#999999', margin: 0 }
