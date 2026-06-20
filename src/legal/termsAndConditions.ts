import type { LegalDocument } from './types';

export const termsAndConditions: LegalDocument = {
  id: 'terms',
  title: 'SOURCEWAVE',
  metaLine: 'SUBSCRIBER TERMS AND CONDITIONS — Effective Date: June 2026 | Version 1.0',
  intro:
    'Please read these Terms and Conditions carefully before accessing or using the SourceWave mobile application. By creating an account, activating a subscription, or using any feature of the platform, you confirm that you have read, understood, and agreed to be bound by these Terms and Conditions in their entirety. If you do not agree to these terms, you must not use the platform.',
  sections: [
    {
      heading: '1. About SourceWave',
      blocks: [
        {
          type: 'p',
          text: "1.1 SourceWave is a mobile sourcing platform that connects buyers in Ghana and West Africa with verified suppliers in the People's Republic of China. The platform facilitates product sourcing requests, buyer-supplier communication, and related services through a structured, technology-driven environment.",
        },
        {
          type: 'p',
          text: '1.2 SourceWave is operated by SourceWave Ltd, a company incorporated under the laws of the Republic of Ghana (hereinafter referred to as SourceWave, we, us, or our), and is powered by Noitavonne, an OEM manufacturing powerhouse headquartered in America with operations based in China.',
        },
        {
          type: 'p',
          text: '1.3 These Terms and Conditions govern your access to and use of the SourceWave mobile application, including all features, services, and content available through the platform (collectively referred to as the Platform).',
        },
      ],
    },
    {
      heading: '2. Eligibility and Account Registration',
      blocks: [
        {
          type: 'p',
          text: '2.1 To access the Platform, you must be at least eighteen (18) years of age and legally capable of entering into a binding agreement under the laws of the Republic of Ghana.',
        },
        {
          type: 'p',
          text: '2.2 You must register an account with accurate, current, and complete information. You are solely responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account.',
        },
        {
          type: 'p',
          text: '2.3 You must not create an account on behalf of another person without their express written authorisation.',
        },
        {
          type: 'p',
          text: '2.4 SourceWave reserves the right to suspend or permanently terminate any account where the information provided is found to be false, misleading, or incomplete.',
        },
        { type: 'p', text: '2.5 Identity Verification Requirement' },
        {
          type: 'p',
          text: 'All subscribers are required to complete a mandatory identity verification process before their account is activated and platform access is granted. Verification must be completed within forty-eight (48) hours of registration. Accounts that remain unverified after this period will be automatically suspended until verification is successfully completed.',
        },
        {
          type: 'p',
          text: 'To complete verification, subscribers must submit a clear, valid, and unexpired government-issued identification document. Accepted forms of ID include:',
        },
        {
          type: 'ul',
          items: [
            'Ghana Card (National Identification Authority)',
            'Valid Passport',
            "Valid Driver's Licence",
            "Voter's Identity Card",
          ],
        },
        {
          type: 'p',
          text: '2.6 SourceWave reserves the right to request additional verification documents where the submitted ID is unclear, expired, or where there is reasonable suspicion of identity fraud. Subscription fees paid will be held and access will not be granted until verification is satisfactorily completed. Where verification fails entirely and SourceWave determines the account cannot be authenticated, a full refund of the subscription fee will be issued. SourceWave will handle all identity documents in accordance with its Privacy Policy and applicable data protection obligations.',
        },
      ],
    },
    {
      heading: '3. Subscription Plans',
      blocks: [
        {
          type: 'p',
          text: '3.1 Access to the SourceWave platform is available through paid subscription plans. The following subscription tiers are currently offered:',
        },
        {
          type: 'ul',
          items: [
            'Standard Plan: Access to core sourcing request features and supplier directory.',
            'PRO Plan: All Standard features plus AI-assisted product description tools, smart follow-up suggestions, completeness scoring, and red flag alerts.',
          ],
        },
        {
          type: 'p',
          text: '3.2 Subscription fees are charged in advance for the selected plan duration. All fees are stated in Ghana Cedis (GHC) and are inclusive of applicable taxes unless otherwise stated.',
        },
        {
          type: 'p',
          text: '3.3 SourceWave reserves the right to modify subscription pricing upon thirty (30) days written notice to existing subscribers. Price changes will not apply to active subscriptions until the next renewal cycle.',
        },
        {
          type: 'p',
          text: '3.4 Subscriptions are non-transferable and may only be used by the registered account holder.',
        },
        {
          type: 'p',
          text: '3.5 SourceWave limits the total number of active subscriptions available at any given time. Subscription availability is offered on a first-come, first-served basis and SourceWave does not guarantee availability at the time of your purchase attempt.',
        },
      ],
    },
    {
      heading: '4. Payment and Refund Policy',
      blocks: [
        {
          type: 'p',
          text: '4.1 Payment is due in full at the time of subscription activation. SourceWave does not offer credit or deferred payment arrangements.',
        },
        {
          type: 'p',
          text: '4.2 All payments are processed through approved payment gateways integrated into the Platform. SourceWave does not store your payment card details.',
        },
        {
          type: 'p',
          text: '4.3 Subscription fees are non-refundable once access has been activated, except where required by applicable Ghanaian consumer protection law, or where SourceWave has failed to provide the subscribed services through no fault of the subscriber.',
        },
        {
          type: 'p',
          text: '4.4 Where a subscriber believes they are entitled to a refund, a written request must be submitted to SourceWave support within seven (7) days of the disputed charge. Requests submitted after this period will not be considered.',
        },
      ],
    },
    {
      heading: '5. Platform Usage Rules',
      blocks: [
        {
          type: 'p',
          text: '5.1 By accessing the Platform, you agree to use it solely for lawful sourcing purposes in accordance with these Terms and Conditions and applicable Ghanaian law.',
        },
        { type: 'p', text: '5.2 You must not use the Platform to:' },
        {
          type: 'ul',
          items: [
            'Submit false, misleading, or fraudulent sourcing requests.',
            'Attempt to source prohibited, counterfeit, or illegal goods.',
            'Harass, threaten, or engage in abusive conduct toward suppliers or SourceWave staff.',
            'Attempt to reverse engineer, copy, or replicate any feature of the Platform.',
            'Share your account credentials or allow any third party to access the Platform through your account.',
            'Upload content that is defamatory, obscene, or in violation of any applicable law.',
          ],
        },
      ],
    },
    {
      heading: '6. In-Platform Communication Policy',
      blocks: [
        {
          type: 'notice',
          text: 'IMPORTANT NOTICE: All communication between subscribers and suppliers MUST take place exclusively through the SourceWave in-app messaging system. Communicating with suppliers outside the platform is strictly prohibited and constitutes a material breach of these Terms and Conditions.',
        },
        {
          type: 'p',
          text: '6.1 SourceWave provides a secure, built-in messaging system with auto-translation functionality to facilitate all communication between buyers and suppliers. This system is the only authorised channel for buyer-supplier interaction on the Platform.',
        },
        { type: 'p', text: '6.2 Subscribers are strictly prohibited from:' },
        {
          type: 'ul',
          items: [
            'Requesting, sharing, or accepting personal contact details from suppliers, including but not limited to WhatsApp numbers, WeChat IDs, phone numbers, email addresses, or social media accounts.',
            'Initiating or continuing any sourcing-related conversation with a supplier through any channel other than the SourceWave in-app messaging system.',
            'Arranging transactions, price negotiations, or order confirmations outside the Platform.',
            'Encouraging or inducing any supplier to communicate or transact outside the Platform.',
          ],
        },
        { type: 'p', text: '6.3 No Support for Off-Platform Communications' },
        {
          type: 'p',
          text: 'SourceWave will not provide any form of support, dispute resolution, mediation, or assistance in relation to any communication, negotiation, transaction, or agreement that takes place outside the SourceWave platform. Subscribers who conduct business with suppliers off-platform do so entirely at their own risk and SourceWave bears no liability whatsoever for any loss, damage, fraud, non-delivery, or dispute arising from such interactions.',
        },
        {
          type: 'p',
          text: '6.4 Where SourceWave reasonably determines that a subscriber has communicated with a supplier outside the Platform, SourceWave reserves the right to:',
        },
        {
          type: 'ul',
          items: [
            'Issue a formal written warning to the subscriber.',
            "Suspend the subscriber's account without refund.",
            "Permanently terminate the subscriber's account without refund.",
            'Remove the relevant supplier from the platform where that supplier is found to have solicited or facilitated off-platform contact.',
          ],
        },
        {
          type: 'p',
          text: "6.5 The in-platform communication policy exists to protect subscribers from fraud, price manipulation, and supply chain risk. SourceWave's verification, quality assurance, and red flag monitoring systems operate exclusively within the Platform and cannot protect subscribers who choose to engage outside it.",
        },
      ],
    },
    {
      heading: '7. Supplier Relationships and Platform Integrity',
      blocks: [
        {
          type: 'p',
          text: '7.1 All suppliers listed on SourceWave have been verified and onboarded through a formal process. SourceWave makes reasonable efforts to maintain the quality and reliability of its supplier network but does not guarantee the performance, product quality, or delivery commitments of any individual supplier.',
        },
        {
          type: 'p',
          text: '7.2 SourceWave operates a markup arrangement with suppliers to sustain platform operations and service quality. This arrangement does not affect the transparency of pricing presented to subscribers.',
        },
        {
          type: 'p',
          text: "7.3 Subscribers must not attempt to identify, contact, or engage with SourceWave's suppliers through external directories, trade platforms, or personal networks for the purpose of bypassing the SourceWave platform. Such conduct constitutes a material breach of these Terms and Conditions and may result in immediate account termination.",
        },
        {
          type: 'p',
          text: '7.4 All supplier relationships introduced through the Platform remain proprietary assets of SourceWave. Subscribers do not acquire any rights over supplier contacts by virtue of their use of the Platform.',
        },
      ],
    },
    {
      heading: '8. PRO Plan AI Features',
      blocks: [
        {
          type: 'p',
          text: '8.1 The AI-assisted features available on the PRO subscription plan are designed to help subscribers articulate their sourcing requirements more clearly. These features include the guided product description builder, image-to-description interpreter, trade vocabulary translator, completeness scorer, supplier-ready brief generator, smart follow-up suggestions, and red flag alerts.',
        },
        {
          type: 'p',
          text: '8.2 AI-generated content is produced for guidance purposes only. SourceWave does not warrant that AI outputs are accurate, complete, or fit for any particular purpose. Subscribers remain solely responsible for reviewing and confirming the accuracy of all AI-generated product descriptions and sourcing briefs before submission to suppliers.',
        },
        {
          type: 'p',
          text: '8.3 SourceWave reserves the right to modify, improve, or discontinue any AI feature with reasonable notice to subscribers. Discontinuation of a specific AI feature does not entitle a subscriber to a refund unless the feature constituted the primary and essential service of their subscription.',
        },
      ],
    },
    {
      heading: '9. Intellectual Property',
      blocks: [
        {
          type: 'p',
          text: '9.1 All content, features, design elements, trademarks, trade names, logos, and technology comprising the SourceWave Platform are the exclusive intellectual property of SourceWave Ltd and are protected under applicable Ghanaian and international intellectual property law.',
        },
        {
          type: 'p',
          text: '9.2 Your subscription grants you a limited, non-exclusive, non-transferable licence to access and use the Platform for personal sourcing purposes only. No rights of ownership in any Platform content or technology are transferred to you by virtue of your subscription.',
        },
        {
          type: 'p',
          text: '9.3 You must not copy, reproduce, distribute, modify, or create derivative works from any content or feature of the Platform without the prior written consent of SourceWave.',
        },
      ],
    },
    {
      heading: '10. Data Privacy',
      blocks: [
        {
          type: 'p',
          text: '10.1 SourceWave collects and processes personal data in accordance with its Privacy Policy, which forms part of these Terms and Conditions and is available within the Platform. By using the Platform, you consent to the collection and use of your data as described in the Privacy Policy.',
        },
        {
          type: 'p',
          text: '10.2 SourceWave does not sell your personal data to third parties. Supplier contact details accessed through the Platform are made available solely for the purpose of facilitating in-platform sourcing communication and may not be extracted, stored, or used for any other purpose.',
        },
        {
          type: 'p',
          text: '10.3 All in-platform communications may be monitored by SourceWave for the purposes of quality assurance, fraud prevention, and enforcement of these Terms and Conditions.',
        },
      ],
    },
    {
      heading: '11. Suspension and Termination',
      blocks: [
        {
          type: 'p',
          text: '11.1 SourceWave reserves the right to suspend or terminate your account at any time where you are found to have breached any provision of these Terms and Conditions, with or without prior notice depending on the severity of the breach.',
        },
        { type: 'p', text: '11.2 The following constitute grounds for immediate termination without refund:' },
        {
          type: 'ul',
          items: [
            'Off-platform communication with suppliers in violation of Section 6.',
            'Fraudulent, abusive, or illegal use of the Platform.',
            'Sharing of account credentials with third parties.',
            "Deliberate attempts to circumvent SourceWave's supplier markup arrangements.",
          ],
        },
        {
          type: 'p',
          text: '11.3 You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of the current billing period and no pro-rated refunds will be issued for unused subscription time.',
        },
      ],
    },
    {
      heading: '12. Limitation of Liability',
      blocks: [
        {
          type: 'p',
          text: '12.1 SourceWave provides the Platform on an as-available basis and makes no warranties, express or implied, regarding the uninterrupted availability, accuracy, or fitness for purpose of the Platform or its content.',
        },
        {
          type: 'p',
          text: '12.2 To the fullest extent permitted by applicable law, SourceWave shall not be liable for any indirect, incidental, consequential, or punitive damages arising from your use of the Platform, including but not limited to: loss of business, loss of profits, failed orders, delayed shipments, or goods that do not meet expectations.',
        },
        {
          type: 'p',
          text: "12.3 SourceWave's total liability to any subscriber in respect of any claim shall not exceed the total subscription fee paid by that subscriber in the three (3) months immediately preceding the event giving rise to the claim.",
        },
        {
          type: 'p',
          text: '12.4 Nothing in these Terms and Conditions excludes or limits SourceWave\'s liability for fraud, death, or personal injury caused by our negligence, to the extent such exclusion is not permitted by Ghanaian law.',
        },
      ],
    },
    {
      heading: '13. Amendments to These Terms',
      blocks: [
        {
          type: 'p',
          text: '13.1 SourceWave reserves the right to amend these Terms and Conditions at any time. Where changes are material, SourceWave will provide at least fourteen (14) days notice to active subscribers via in-app notification or registered email before the changes take effect.',
        },
        {
          type: 'p',
          text: '13.2 Your continued use of the Platform following the effective date of any amendment constitutes your acceptance of the revised Terms and Conditions.',
        },
        {
          type: 'p',
          text: '13.3 If you do not agree to any amended terms, you must discontinue use of the Platform and may cancel your subscription in accordance with Section 11.3.',
        },
      ],
    },
    {
      heading: '14. Governing Law and Disputes',
      blocks: [
        {
          type: 'p',
          text: '14.1 These Terms and Conditions are governed by and construed in accordance with the laws of the Republic of Ghana.',
        },
        {
          type: 'p',
          text: "14.2 Any dispute arising out of or in connection with these Terms and Conditions shall first be referred to SourceWave's customer support team for resolution. If the matter is not resolved within fourteen (14) days, either party may refer the dispute to mediation or, failing that, to the courts of Ghana.",
        },
      ],
    },
    {
      heading: '15. Contact and Support',
      blocks: [
        {
          type: 'p',
          text: '15.1 For all platform-related support, account queries, or complaints, subscribers must contact SourceWave through the official support channel available within the application.',
        },
        {
          type: 'p',
          text: '15.2 SourceWave aims to respond to all support requests within forty-eight (48) business hours.',
        },
        {
          type: 'p',
          text: '15.3 As stated in Section 6.3 of these Terms, SourceWave will not provide support for any matter arising from communication or transactions conducted outside the Platform.',
        },
      ],
    },
  ],
  closing:
    'By subscribing to SourceWave, you confirm that you have read, understood, and accepted these Terms and Conditions in full.',
  footerLine: 'SourceWave — Connecting Ghana to China — Version 1.0 — June 2026',
};
