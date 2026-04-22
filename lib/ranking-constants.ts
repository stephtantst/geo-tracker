export const TRACKED_COMPETITORS = [
  // Payment gateways (global / regional)
  "Stripe", "Adyen", "Braintree", "PayPal", "Square", "Razorpay",
  "Xendit", "Midtrans", "2C2P", "OmniPay", "Airwallex", "Aspire",
  // Singapore
  "PayNow", "GrabPay", "Qashier", "Atome", "Fave", "NETS",
  "Fiuu", "Red Dot Payment", "KPay", "EPOS", "Koomi", "Revolut",
  // Malaysia
  "DuitNow", "Billplz", "iPay88", "PayEx", "Paydollar", "Curlec", "Toyyibpay",
  "SenangPay", "eGHL", "Pinelabs", "Razer", "Maybank", "CIMB",
  "Public Bank", "RHB Bank", "Hong Leong Bank", "AmBank", "Bank Rakyat",
  // Philippines
  "PayMongo", "Dragonpay", "Paynamics", "Maya", "GCash",
  "PesoPay", "Bux", "SwiftPay", "Unionbank", "BDO", "Metrobank",
  "RCBC", "AUB", "Veritas Pay", "GHL",
  // POS systems (SEA-specific)
  "StoreHub", "Lightspeed", "Mosaic", "Peddlr", "UTAK",
  // B2B / SaaS billing
  "Chargebee",
];

export const BRAND_URLS: Record<string, string> = {
  "HitPay": "https://hitpay.com",
  // Global
  "Stripe": "https://stripe.com",
  "Adyen": "https://www.adyen.com",
  "Braintree": "https://www.braintreepayments.com",
  "PayPal": "https://www.paypal.com",
  "Square": "https://squareup.com",
  "Razorpay": "https://razorpay.com",
  "Xendit": "https://www.xendit.co",
  "Midtrans": "https://midtrans.com",
  "2C2P": "https://www.2c2p.com",
  "Chargebee": "https://www.chargebee.com",
  "Airwallex": "https://www.airwallex.com",
  "Aspire": "https://aspireapp.com",
  // Singapore
  "PayNow": "https://www.abs.org.sg/consumer-banking/pay-now",
  "GrabPay": "https://www.grab.com/sg/pay",
  "Qashier": "https://qashier.com",
  "Atome": "https://www.atome.sg",
  "Fave": "https://myfave.com",
  "NETS": "https://www.nets.com.sg",
  "Fiuu": "https://www.fiuu.com",
  "Red Dot Payment": "https://www.reddotpayment.com",
  "KPay": "https://www.kpay.com.hk",
  "EPOS": "https://epos.com.sg",
  "Koomi": "https://koomi.co",
  "Revolut": "https://www.revolut.com",
  // Malaysia
  "DuitNow": "https://www.mepsfpx.com.my",
  "Billplz": "https://www.billplz.com",
  "iPay88": "https://www.ipay88.com",
  "Curlec": "https://www.curlec.com",
  "Toyyibpay": "https://toyyibpay.com",
  "SenangPay": "https://senangpay.my",
  "eGHL": "https://eghl.com",
  "Pinelabs": "https://www.pinelabs.com",
  "Razer": "https://merchant.razer.com",
  "Maybank": "https://www.maybank2u.com.my",
  "CIMB": "https://www.cimb.com.my",
  "Public Bank": "https://www.pbebank.com",
  "RHB Bank": "https://www.rhbgroup.com",
  "Hong Leong Bank": "https://www.hlbank.com.my",
  "AmBank": "https://www.ambankgroup.com",
  "Bank Rakyat": "https://www.bankrakyat.com.my",
  // Philippines
  "PayMongo": "https://www.paymongo.com",
  "Dragonpay": "https://www.dragonpay.ph",
  "Paynamics": "https://www.paynamics.com",
  "Maya": "https://www.maya.ph",
  "GCash": "https://www.gcash.com",
  "PesoPay": "https://www.pesopay.com",
  "Bux": "https://bux.ph",
  "SwiftPay": "https://swiftpay.ph",
  "Unionbank": "https://www.unionbankph.com",
  "BDO": "https://www.bdo.com.ph",
  "Metrobank": "https://www.metrobank.com.ph",
  "RCBC": "https://www.rcbc.com",
  "AUB": "https://www.aub.com.ph",
  "Veritas Pay": "https://veritaspay.ph",
  "GHL": "https://www.ghl.com",
  // POS
  "StoreHub": "https://www.storehub.com",
  "Lightspeed": "https://www.lightspeedhq.com",
  "Mosaic": "https://www.mosaicpos.com",
  "Peddlr": "https://peddlr.com",
  "UTAK": "https://utak.ph",
};

export const COMPETITORS_BY_MARKET: Record<string, { online: string[]; inPerson: string[] }> = {
  SG: {
    online: ["HitPay", "Stripe", "Adyen", "Airwallex", "Fiuu", "Red Dot Payment", "PayNow", "GrabPay", "Atome", "Fave"],
    inPerson: ["HitPay", "Qashier", "KPay", "Fiuu", "Airwallex", "Red Dot Payment", "EPOS", "Koomi", "Revolut", "NETS", "StoreHub"],
  },
  MY: {
    online: ["HitPay", "Stripe", "iPay88", "Billplz", "Fiuu", "Razer", "SenangPay", "eGHL", "Curlec", "Pinelabs", "DuitNow"],
    inPerson: ["HitPay", "StoreHub", "Pinelabs", "Maybank", "CIMB", "Public Bank", "RHB Bank", "Hong Leong Bank", "AmBank", "Bank Rakyat"],
  },
  PH: {
    online: ["HitPay", "PayMongo", "Xendit", "PesoPay", "Maya", "Dragonpay", "Paynamics", "Bux", "2C2P", "SwiftPay", "PayPal", "OmniPay"],
    inPerson: ["HitPay", "BDO", "Unionbank", "Metrobank", "RCBC", "AUB", "Maya", "Veritas Pay", "GHL"],
  },
};

export const MARKET_FULL_NAMES: Record<string, string> = {
  SG: "Singapore",
  MY: "Malaysia",
  PH: "Philippines",
  Global: "Global",
};
