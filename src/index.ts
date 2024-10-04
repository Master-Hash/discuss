// import { EmailMessage } from "cloudflare:email";
// import { Hono } from 'hono';
import { sha256 } from "hono/utils/crypto";
// import { createMimeMessage } from "mimetext/browser";
import PostalMime from 'postal-mime';
// import { toText } from "hast-util-to-text";
// import { fromHtml } from "hast-util-from-html";

// const app = new Hono();



// app.get('/', (c) => {
//   return c.text('Hello Hono!');
// });

export default {
  // fetch: app.fetch,
  async email(message: ForwardableEmailMessage, env: Env) {
    try {
      const requiredRecord = ["Subject", "Message-ID", "Date", "Content-Type"];
      requiredRecord.forEach((key) => {
        if (!message.headers.has(key)) {
          message.setReject(`Missing required header: ${key}`);
        }
      });
      if (message.to !== env.MAILBOX) message.setReject("Illegal recipient");
      if (message.from.includes("reply")) message.setReject("Sender in denylist");
      // const subject = message.headers.get("Subject");
      const id = message.headers.get("Message-ID");

      // query
      //       if (subject?.startsWith("GET ")) {
      //         const queryHash = subject.slice(4);
      //         const statement = env.DB.prepare("SELECT * FROM GlobalMessages WHERE Folder = 'Discuss' AND MessageIDHash LIKE ?1 LIMIT 1").bind(queryHash + "%");
      //         const res = await statement.first() as {
      //           MessageID: string;
      //           MessageIDHash: string;
      //           SubjectLine: string;
      //           Epoch: number;
      //           Author: string;
      //           // We suppose the RAWMessage exists
      //         };
      //         if (!res) {
      //           message.setReject("Replied message not found. It's likely that you wrongly replied or forwarded the message.");
      //           return;
      //         } else {
      //           const msg = createMimeMessage();
      //           const author = JSON.parse(res.Author);
      //           const RAWMessage = await env.R2.get("discuss/" + res.MessageIDHash);
      //           const parsed = await PostalMime.parse(RAWMessage?.body);
      //           msg.setHeader("In-Reply-To", message.headers.get("Message-ID")!);
      //           msg.setSender({ name: env.SENDER, addr: env.MAILBOX });
      //           msg.setRecipient(message.from);
      //           msg.setSubject(res.SubjectLine);
      //           msg.addMessage({
      //             contentType: "text/plain; charset=UTF-8; format=flowed",
      //             data: `读者你好！以下是你查询的邮件，你可以回复此邮件来评论：

      // 时间\t${new Intl.DateTimeFormat("zh-CN", { dateStyle: "full", timeStyle: "short" }).format(new Date(res.Epoch * 1000))}
      // 发件人\t${author.name} <${author.address}>
      // 主题\t${res.SubjectLine}

      // ${parsed.text || parsed.html ? toText(fromHtml(parsed.html!, { fragment: true })) : "（无正文）"}
      // `});
      //           msg.setHeader("Message-ID", res.MessageID);
      //           console.log(msg.asRaw());
      //           const replyMessage = new EmailMessage(
      //             env.MAILBOX,
      //             message.from,
      //             msg.asRaw(),
      //           );
      //           await message.reply(replyMessage);
      //         }
      //       } else


      // comment or reply to comment
      // const [parsedStream, forwardedStream] = message.raw.tee()

      // const raw = await new Response(message.raw).text();
      const hash = await sha256(id!);

      // Bug: 原始邮件似乎不能流式扔给 R2
      // Provided readable stream must have a known length (request/response body or readable half of FixedLengthStream)
      // https://community.cloudflare.com/t/email-workers-access-to-attachments-body-or-raw-message/452913
      // const [raw1, raw2] = message.raw.tee();
      const s = await new Response(message.raw).text();
      const msg = await PostalMime.parse(s);

      // If the replied message is not found, reject the message
      // It is likely to happen when the message is forwarded
      if (msg.inReplyTo) {
        const statement = env.DB.prepare("SELECT MessageID FROM GlobalMessages WHERE Folder = 'Discuss' AND MessageID = ?1").bind(msg.inReplyTo);
        const dedupeStatement = env.DB.prepare("SELECT MessageID FROM GlobalMessages WHERE MessageID = ?1").bind(id);
        // const res = await statement.first();
        const [res, dedupeRes] = await env.DB.batch([statement, dedupeStatement]);
        if (res.results.length === 0) {
          message.setReject("Message you're replying to not found");
          return;
        }
        if (dedupeRes.results.length > 0) {
          message.setReject("Message-ID duplicated");
          return;
        }
      }
      console.log(s);
      await env.R2.put("Discuss/" + id?.slice(1, -1) + ".eml", s);

      // Add D1 record
      const statement = env.DB.prepare("INSERT INTO GlobalMessages (Folder, MessageID, MessageIDHash, Epoch, InReplyTo, SubjectLine, Author, Recipients, RAWMessage, FolderSerial) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)")
        .bind(
          "Discuss",
          msg.messageId,
          hash,
          new Date(msg.date!).valueOf() / 1000,
          msg.inReplyTo ?? null,
          msg.subject,
          JSON.stringify(msg.from),
          JSON.stringify([...(msg.to || []), ...(msg.cc || []), ...(msg.bcc || [])]),
          true,
          null,
        );
      await statement.run();

      console.log(message, message.from);
      // If the Admin is the sender
      if (message.from === env.SUBSCRIBER || message.from.split("@")[1].includes(env.MAILBOX.split("@")[1])) {
        console.log("发件人是我");
      } else {
        console.log("发件人不是我");
        // Forward to the Admin
        // await message.forward(env.SUBSCRIBER); // It seems we don't have to tee the stream
      }

    } catch (e) {
      message.setReject(`Internal Service Error: ${e}`);
      throw e;
    }
  }
};
