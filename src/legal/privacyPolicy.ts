import type { LegalDocument } from './types';

export const privacyPolicy: LegalDocument = {
  id: 'privacy',
  title: 'SOURCEWAVE',
  metaLine: 'PRIVACY POLICY — Effective Date: June 2026 | Version 1.0',
  intro:
    'This Privacy Policy explains how SourceWave Ltd collects, uses, stores, shares, and protects your personal information when you use the SourceWave mobile application. Please read it carefully. By registering an account or using the Platform, you confirm that you have read and understood this Privacy Policy and consent to the collection and use of your information as described herein.',
  sections: [
    {
      heading: '1. Who We Are',
      blocks: [
        {
          type: 'p',
          text: '1.1 SourceWave is operated by SourceWave Ltd, a company incorporated under the laws of the Republic of Ghana, and is powered by Noitavonne, an OEM manufacturing powerhouse headquartered in America with operations based in China (collectively referred to in this Policy as SourceWave, we, us, or our).',
        },
        {
          type: 'p',
          text: '1.2 SourceWave is the data controller responsible for your personal information collected through the SourceWave mobile application (the Platform). We are committed to protecting your privacy and handling your personal data with transparency, integrity, and in full compliance with applicable Ghanaian data protection law, including the Data Protection Act, 2012 (Act 843).',
        },
        {
          type: 'p',
          text: '1.3 If you have any questions about this Privacy Policy or how we handle your data, you may contact us through the official support channel within the Platform.',
        },
      ],
    },
    {
      heading: '2. Information We Collect',
      blocks: [
        {
          type: 'p',
          text: '2.1 We collect personal information from you in three ways: information you provide directly, information collected automatically through your use of the Platform, and information received from third parties where applicable.',
        },
        { type: 'p', text: '2.2 Information You Provide Directly' },
        {
          type: 'p',
          text: 'When you register, verify your identity, or use the Platform, we collect:',
        },
        {
          type: 'ul',
          items: [
            'Full name, email address, and phone number provided at registration.',
            'Government-issued identity document submitted for account verification, including document type, ID number, and a scan or photograph of the document.',
            'Sourcing requests, product descriptions, images, and budget information submitted through the Platform.',
            'All messages sent through the in-platform messaging system between you and suppliers.',
            'Payment information processed at subscription activation. Note: SourceWave does not store your full card details. Payment processing is handled by our approved payment gateway partners.',
            'Any feedback, support requests, or correspondence you submit to SourceWave.',
          ],
        },
        { type: 'p', text: '2.3 Information Collected Automatically' },
        {
          type: 'p',
          text: 'When you access and use the Platform, we automatically collect:',
        },
        {
          type: 'ul',
          items: [
            'Device information, including device type, operating system, and unique device identifiers.',
            'Log data, including your IP address, access times, pages viewed, and actions taken within the Platform.',
            'Usage data, including sourcing request patterns, messaging activity, feature engagement, and subscription activity.',
            'Cookies and similar tracking technologies used to maintain session integrity and improve Platform performance.',
          ],
        },
        { type: 'p', text: '2.4 Information from Third Parties' },
        {
          type: 'p',
          text: 'We may receive limited information about you from third-party payment processors for the purpose of confirming subscription transactions, and from identity verification service providers where we use automated verification tools.',
        },
      ],
    },
    {
      heading: '3. How We Use Your Information',
      blocks: [
        {
          type: 'p',
          text: '3.1 We use the personal information we collect for the following purposes:',
        },
        { type: 'p', text: 'Platform Operation and Service Delivery' },
        {
          type: 'ul',
          items: [
            'To create and manage your SourceWave account.',
            'To verify your identity before activating platform access.',
            'To process your subscription payment and maintain your access.',
            'To facilitate sourcing requests and in-platform communication between you and verified suppliers.',
            'To power AI-assisted features on the PRO subscription plan, including product description building, vocabulary translation, and red flag alerts.',
            'To provide customer support and respond to your enquiries.',
          ],
        },
        { type: 'p', text: 'Platform Safety and Integrity' },
        {
          type: 'ul',
          items: [
            'To monitor in-platform communications for fraud prevention, quality assurance, and enforcement of our Terms and Conditions.',
            'To detect, investigate, and prevent violations of our platform rules, including off-platform communication with suppliers.',
            'To protect the security and integrity of the Platform and its users.',
          ],
        },
        { type: 'p', text: 'Platform Improvement' },
        {
          type: 'ul',
          items: [
            'To analyse usage patterns and improve the features, performance, and user experience of the Platform.',
            'To train and improve AI-assisted features using anonymised and aggregated data.',
          ],
        },
        { type: 'p', text: 'Legal and Compliance' },
        {
          type: 'ul',
          items: [
            'To comply with applicable Ghanaian laws, regulations, and lawful requests from regulatory or law enforcement authorities.',
            'To establish, exercise, or defend legal claims arising from your use of the Platform.',
          ],
        },
      ],
    },
    {
      heading: '4. Identity Documents and Verification Data',
      blocks: [
        {
          type: 'p',
          text: '4.1 Given the sensitive nature of identity documents collected during the verification process, we apply the following specific protections:',
        },
        {
          type: 'ul',
          items: [
            'Identity documents are collected solely for the purpose of verifying your identity before account activation.',
            'Documents are stored in encrypted form and access is restricted to authorised SourceWave personnel only.',
            'Identity documents will not be shared with suppliers, third-party advertisers, or any other commercial party.',
            'Verification documents will be retained for a period of twelve (12) months following account closure, after which they will be permanently and securely deleted, unless a longer retention period is required by applicable law.',
            'You may request the deletion of your identity documents at any time by contacting SourceWave support. Where deletion is legally permissible, we will action your request within thirty (30) days.',
          ],
        },
      ],
    },
    {
      heading: '5. In-Platform Messaging and Communications',
      blocks: [
        {
          type: 'p',
          text: '5.1 All messages exchanged between subscribers and suppliers through the SourceWave in-platform messaging system are stored on our servers for the following purposes:',
        },
        {
          type: 'ul',
          items: [
            'To provide you with a complete and accessible record of your sourcing communications.',
            'To monitor compliance with our in-platform communication policy and detect off-platform communication violations.',
            'To support dispute resolution between buyers and suppliers where required.',
            'To improve AI-assisted features using anonymised communication patterns.',
          ],
        },
        {
          type: 'p',
          text: '5.2 By using the in-platform messaging system, you acknowledge and consent to SourceWave monitoring the content of your communications for the purposes described above. This monitoring is disclosed in our Terms and Conditions and forms part of your agreement with SourceWave.',
        },
        {
          type: 'p',
          text: '5.3 Message records will be retained for a period of twenty-four (24) months following the end of your active subscription, after which they will be permanently deleted unless required for an active dispute or legal proceeding.',
        },
      ],
    },
    {
      heading: '6. How We Share Your Information',
      blocks: [
        {
          type: 'p',
          text: '6.1 SourceWave does not sell your personal information to any third party for commercial or marketing purposes. We share your information only in the following limited circumstances:',
        },
        { type: 'p', text: 'With Verified Suppliers' },
        {
          type: 'p',
          text: 'When you submit a sourcing request, the relevant details of your request, including product description, budget range, and quantity requirements, are shared with matched suppliers to enable them to respond. Your full name, contact details, and identity documents are never shared with suppliers.',
        },
        { type: 'p', text: 'With Service Providers' },
        {
          type: 'p',
          text: 'We share information with trusted third-party service providers who assist us in operating the Platform, including payment processors, cloud hosting providers, identity verification services, and AI technology partners. These providers are contractually required to handle your data securely and only for the purposes for which it is shared.',
        },
        { type: 'p', text: 'With Noitavonne' },
        {
          type: 'p',
          text: 'As the manufacturing and operational partner powering SourceWave, Noitavonne may receive aggregated and anonymised sourcing data for the purpose of improving supplier matching and platform capability. Noitavonne does not receive your personal identification information or individual message content.',
        },
        { type: 'p', text: 'For Legal Compliance' },
        {
          type: 'p',
          text: 'We may disclose your personal information to regulatory bodies, law enforcement agencies, or courts where we are legally required to do so, or where we reasonably believe disclosure is necessary to protect the rights, safety, or property of SourceWave, its users, or the public.',
        },
        { type: 'p', text: 'In a Business Transfer' },
        {
          type: 'p',
          text: "In the event of a merger, acquisition, or sale of all or part of SourceWave's business, your personal data may be transferred to the acquiring entity as part of the transaction. You will be notified of any such transfer and your data will remain subject to the protections described in this Privacy Policy.",
        },
      ],
    },
    {
      heading: '7. International Data Transfers',
      blocks: [
        {
          type: 'p',
          text: '7.1 As a platform facilitating trade between Ghana and China, some of your data may be processed or stored on servers located outside Ghana, including in China and the United States, where Noitavonne operates.',
        },
        {
          type: 'p',
          text: '7.2 Where your data is transferred internationally, SourceWave ensures that appropriate safeguards are in place to protect your information in accordance with the Data Protection Act, 2012 (Act 843) and equivalent international standards.',
        },
        {
          type: 'p',
          text: '7.3 By using the Platform, you consent to the international transfer of your data as described in this section.',
        },
      ],
    },
    {
      heading: '8. Data Retention',
      blocks: [
        {
          type: 'p',
          text: '8.1 We retain your personal information only for as long as necessary to fulfil the purposes described in this Privacy Policy, or as required by applicable law. The following general retention periods apply:',
        },
        {
          type: 'ul',
          items: [
            'Account information: Retained for the duration of your active account and for a period of twenty-four (24) months following account closure.',
            'Identity verification documents: Retained for twelve (12) months following account closure, then securely deleted.',
            'In-platform messages: Retained for twenty-four (24) months following the end of active subscription, then permanently deleted.',
            'Payment transaction records: Retained for seven (7) years in compliance with Ghanaian financial record-keeping requirements.',
            'Usage and log data: Retained for twelve (12) months and then anonymised or deleted.',
          ],
        },
        {
          type: 'p',
          text: '8.2 Where data is retained for legal, compliance, or dispute-resolution purposes beyond the periods stated above, it will be stored securely and access will be restricted to authorised personnel only.',
        },
      ],
    },
    {
      heading: '9. Your Data Rights',
      blocks: [
        {
          type: 'p',
          text: '9.1 Under the Data Protection Act, 2012 (Act 843) of Ghana, you have the following rights with respect to your personal information:',
        },
        { type: 'p', text: 'Right of Access' },
        {
          type: 'p',
          text: 'You have the right to request a copy of the personal information SourceWave holds about you. We will provide this within thirty (30) days of a verified request.',
        },
        { type: 'p', text: 'Right to Correction' },
        {
          type: 'p',
          text: 'You have the right to request that we correct any inaccurate or incomplete personal information we hold about you.',
        },
        { type: 'p', text: 'Right to Deletion' },
        {
          type: 'p',
          text: 'You have the right to request the deletion of your personal information where it is no longer necessary for the purposes for which it was collected, subject to our legal obligations to retain certain records.',
        },
        { type: 'p', text: 'Right to Withdraw Consent' },
        {
          type: 'p',
          text: 'Where we process your data on the basis of your consent, you have the right to withdraw that consent at any time. Withdrawal of consent will not affect the lawfulness of processing carried out prior to withdrawal.',
        },
        { type: 'p', text: 'Right to Object' },
        {
          type: 'p',
          text: 'You have the right to object to the processing of your personal information where that processing is based on our legitimate interests, and where your individual circumstances justify such objection.',
        },
        {
          type: 'p',
          text: '9.2 To exercise any of your data rights, please submit a written request through the support channel available within the Platform. We will acknowledge your request within seven (7) days and action it within thirty (30) days, subject to identity verification.',
        },
        {
          type: 'p',
          text: '9.3 If you are dissatisfied with how SourceWave handles your data rights request, you may lodge a complaint with the Data Protection Commission of Ghana.',
        },
      ],
    },
    {
      heading: '10. Data Security',
      blocks: [
        {
          type: 'p',
          text: '10.1 SourceWave takes the security of your personal information seriously. We implement industry-standard technical and organisational measures to protect your data against unauthorised access, alteration, disclosure, or destruction. These measures include:',
        },
        {
          type: 'ul',
          items: [
            'Encryption of sensitive data, including identity documents, at rest and in transit.',
            'Secure access controls restricting data access to authorised personnel only.',
            'Regular security assessments of Platform infrastructure.',
            'Secure payment processing through certified third-party payment gateways.',
          ],
        },
        {
          type: 'p',
          text: '10.2 While we take all reasonable steps to protect your information, no digital platform can guarantee absolute security. In the event of a data breach that is likely to result in a risk to your rights and freedoms, SourceWave will notify affected subscribers and the relevant regulatory authority in accordance with applicable law.',
        },
      ],
    },
    {
      heading: '11. Cookies and Tracking Technologies',
      blocks: [
        {
          type: 'p',
          text: '11.1 SourceWave uses cookies and similar tracking technologies within the Platform to maintain your session, remember your preferences, and analyse usage patterns for platform improvement.',
        },
        { type: 'p', text: '11.2 The following types of cookies are used:' },
        {
          type: 'ul',
          items: [
            'Essential cookies: Required for the Platform to function correctly, including maintaining your login session and subscription status.',
            'Analytics cookies: Used to understand how subscribers use the Platform so we can improve its features and performance.',
          ],
        },
        {
          type: 'p',
          text: '11.3 Essential cookies cannot be disabled as they are necessary for platform functionality. Analytics cookies may be managed through your device or app settings where technically possible.',
        },
      ],
    },
    {
      heading: "12. Children's Privacy",
      blocks: [
        {
          type: 'p',
          text: '12.1 The SourceWave Platform is not intended for use by individuals under the age of eighteen (18). We do not knowingly collect personal information from minors.',
        },
        {
          type: 'p',
          text: '12.2 If we become aware that we have collected personal information from a person under the age of eighteen without verified parental or guardian consent, we will take immediate steps to delete that information and close the associated account.',
        },
        {
          type: 'p',
          text: '12.3 If you believe a minor has registered on the Platform, please notify us immediately through the in-app support channel.',
        },
      ],
    },
    {
      heading: '13. Changes to This Privacy Policy',
      blocks: [
        {
          type: 'p',
          text: '13.1 SourceWave reserves the right to update or amend this Privacy Policy at any time to reflect changes in our data practices, legal obligations, or Platform features.',
        },
        {
          type: 'p',
          text: '13.2 Where changes are material, we will notify active subscribers via in-app notification or registered email at least fourteen (14) days before the changes take effect.',
        },
        {
          type: 'p',
          text: '13.3 Your continued use of the Platform following the effective date of any updated Privacy Policy constitutes your acceptance of the revised terms. If you do not agree with any changes, you must discontinue use of the Platform and may close your account in accordance with the Terms and Conditions.',
        },
      ],
    },
    {
      heading: '14. Contact Us',
      blocks: [
        {
          type: 'p',
          text: '14.1 If you have any questions, concerns, or requests relating to this Privacy Policy or the way SourceWave handles your personal data, please contact us through the official support channel available within the SourceWave mobile application.',
        },
        {
          type: 'p',
          text: '14.2 For formal data rights requests, complaints, or concerns that are not resolved through our support channel, you may also contact the Data Protection Commission of Ghana through their official channels.',
        },
        {
          type: 'p',
          text: '14.3 SourceWave is committed to resolving all privacy-related concerns promptly, transparently, and in accordance with applicable Ghanaian data protection law.',
        },
      ],
    },
  ],
  closing:
    'By using SourceWave, you confirm that you have read and understood this Privacy Policy and consent to the collection and use of your personal information as described herein.',
  footerLine: 'SourceWave — Connecting Ghana to China — Privacy Policy — Version 1.0 — June 2026',
};
