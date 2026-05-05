/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to Campaign Data Solutions</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://muslimvoterproject.com/logo-icon.png" alt="Campaign Data Solutions" width="48" height="48" style={logo} />
        <Heading style={h1}>You've been invited</Heading>
        <Text style={text}>
          You've been invited to join{' '}
          <Link href={siteUrl} style={link}>
            <strong>Campaign Data Solutions</strong>
          </Link>
          — data-driven insights for civic engagement. Click the button below
          to accept the invitation and create your account.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Accept Invitation
        </Button>
        <Text style={footer}>
          If you weren't expecting this invitation, you can safely ignore this
          email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '20px 25px' }
const logo = { width: '48px', height: '48px', margin: '0 auto 10px', borderRadius: '8px', display: 'block' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0e1117', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#6b7280', lineHeight: '1.5', margin: '0 0 25px' }
const link = { color: '#0ea5c9', textDecoration: 'underline' }
const button = { backgroundColor: '#0ea5c9', color: '#0e1117', fontSize: '14px', fontWeight: 'bold' as const, borderRadius: '8px', padding: '12px 20px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
