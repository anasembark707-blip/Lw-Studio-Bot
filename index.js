const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    ChannelType, 
    PermissionsBitField,
    SlashCommandBuilder,
    REST,
    Routes,
    ActivityType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');

let discordTranscripts;
try {
    discordTranscripts = require('discord-html-transcripts');
} catch (e) {
    discordTranscripts = null;
}

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Lw Studio Bot is active and running! 🚀');
});

app.listen(PORT, () => {
    console.log(`Web server is listening on port ${PORT}`);
});

const dbPath = path.join(__dirname, 'database.json');

const ROLES = {
    STAFF: "1557096881140535469",         // فريق الإدارة
    BAN_PERMISSION: "1563202863336005692",// تصريح باند
    BAN_TEAM: "1557095186935455755",     // مسؤولين الباند
    SUPPORT: "1557095817427558420",      // مسؤولين الدعم الفني
    COMPENSATION: "1545853973922058281", // مسؤولين التعويض
    LAB_ROLE: "1546001638278434936"      // رتبه نظام الفصل
};

const CHANNELS = {
    LOG: "1550972645976309781",          // روم لوق تكتات
    CATEGORY: "1550992320835362846",     // كاتجوري تكتات تفعيل
    LAB_LOG: "1555934771274719362",      // روم فصل المختبرين
    TIMEOUT_LOG: "1547308390844211250",  // روم كشف التايم
    BAN_LOG: "1563288678061834381"      // روم كشف الباند
};

function getGuildConfig(guildId) {
    if (!fs.existsSync(dbPath)) return { ticketCounter: 0, points: {} };
    try {
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        return data[guildId] || { ticketCounter: 0, points: {} };
    } catch (e) {
        return { ticketCounter: 0, points: {} };
    }
}

function saveGuildConfig(guildId, newConfig) {
    let data = {};
    if (fs.existsSync(dbPath)) {
        try {
            data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        } catch (e) {
            data = {};
        }
    }
    data[guildId] = { ...(data[guildId] || {}), ...newConfig };
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

function parseDuration(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)([smhd])$/i);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans
    ]
});

const activeTickets = new Map();
const renameCooldowns = new Map();

client.once('ready', async () => {
    console.log(`تم تسجيل الدخول بنجاح باسم ${client.user.tag}! البوت جاهز.`);

    client.user.setPresence({
        activities: [{ name: 'Tickets System by Lw Studio Bot', type: ActivityType.Watching }],
        status: 'online',
    });

    const commands = [
        new SlashCommandBuilder()
            .setName('setup-tickets')
            .setDescription('إرسال بنر التذاكر الرئيسي في الروم الحالي'),
        new SlashCommandBuilder()
            .setName('pointict')
            .setDescription('عرض نقاط الفريق الإداري للتذاكر'),
        new SlashCommandBuilder()
            .setName('restpointict')
            .setDescription('تصفير نقاط الفريق الإداري للتذاكر'),
        new SlashCommandBuilder()
            .setName('laboratory-session')
            .setDescription('نظام فصل المختبرين')
            .addUserOption(option => 
                option.setName('user')
                    .setDescription('العضو المراد فصله')
                    .setRequired(true))
            .addStringOption(option => 
                option.setName('reason')
                    .setDescription('سبب الفصل')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('alltimeout')
            .setDescription('عرض قائمة بجميع الأعضاء الذين عليهم تايم أوت (للأدمن فقط)'),
        new SlashCommandBuilder()
            .setName('allban')
            .setDescription('عرض قائمة بجميع الأعضاء المبندين من الأقدم للأحدث (للأدمن فقط)'),
        new SlashCommandBuilder()
            .setName('alluntimeout')
            .setDescription('إزالة التايم أوت عن جميع الأعضاء دفعة واحدة (للأدمن فقط)'),
        new SlashCommandBuilder()
            .setName('allunban')
            .setDescription('إزالة الباند عن جميع الأعضاء المبندين دفعة واحدة (للأدمن فقط)')
    ];

    const botToken = process.env.DISCORD_TOKEN;
    const rest = new REST({ version: '10' }).setToken(botToken);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('تم تسجيل أوامر السلاش بنجاح! 🚀');
    } catch (error) {
        console.error('خطأ في تسجيل أوامر السلاش:', error);
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    const args = content.split(/\s+/);
    const command = args[0].toLowerCase();

    if (command === '-تايم') {
        if (!message.member.roles.cache.has(ROLES.STAFF)) {
            return message.reply("عذراً، لا يمكنك استخدام هذا الأمر إلا للرتبة المخصصة (فريق الإدارة)! ❌");
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply(" ** الرجاء كتابة السبب ومنشن الشخص وكتابة المدة ⚠️ **");
        }

        const durationStr = args[2];
        const durationMs = parseDuration(durationStr);
        const reason = args.slice(3).join(' ') || " بدون سبب مدخل ";

        if (!durationMs) {
            return message.reply("الرجاء كتابة السبب ومنشنة الشخص وكتابة المدة بشكل صحيح (مثال: `1d` أو `10m` أو `1h`) ⚠️");
        }

        try {
            await targetMember.timeout(durationMs, reason);
            await message.delete().catch(() => {});

            const successEmbed = new EmbedBuilder()
                .setColor(0xFFFF00)
                .setTitle("**تم اعطاء تايم بنجاح ✅️ ⚠️**")
                .setDescription(`**بواسطة :** <@${message.author.id}> | **الشخص :** <@${targetMember.id}> | **السبب :** ${reason}`);

            await message.channel.send({ embeds: [successEmbed] });

            const timeLogChannel = message.guild.channels.cache.get(CHANNELS.TIMEOUT_LOG);
            if (timeLogChannel) {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor(0xFFFF00)
                    .setDescription(
                        `** تم اعطاء تايم اوت | Timeout **\n\n\n\n` +
                        `**الشخص المكتوم :**\n` +
                        `<@${targetMember.id}>\n\n\n\n` +
                        `**مدة التايم :**\n` +
                        `${durationStr}\n\n\n\n` +
                        `**الاداري الي معطي التايم :**\n` +
                        `<@${message.author.id}>\n\n\n\n` +
                        `**سبب وضع التايم :**\n` +
                        `[${reason}]\n\n\n` +
                        `** **`
                    )
                    .setTimestamp();

                await timeLogChannel.send({ embeds: [timeoutEmbed] });
            }
        } catch (err) {
            console.error(err);
            message.channel.send("حدث خطأ أثناء إعطاء التايم أوت، تأكد من صلاحيات البوت ورتبة العضو! ❌");
        }
        return;
    }

    if (command === '-تكلم') {
        if (!message.member.roles.cache.has(ROLES.STAFF)) {
            return message.reply("عذراً، لا يمكنك استخدام هذا الأمر إلا للرتبة المخصصة (فريق الإدارة)! ❌");
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply("الرجاء منشن العضو المراد إزالة التايم أوت عنه! ⚠️");
        }

        try {
            await targetMember.timeout(null);
            await message.delete().catch(() => {});
            return message.channel.send(`تم إزالة التايم أوت عن العضو <@${targetMember.id}> بنجاح ✅`);
        } catch (err) {
            return message.channel.send("فشل في إزالة التايم أوت عن العضو! ❌");
        }
    }

    if (command === '-باند') {
        if (!message.member.roles.cache.has(ROLES.BAN_PERMISSION)) {
            return message.reply("عذراً، لا يمكنك استخدام هذا الأمر إلا للرتبة المخصصة (تصريح باند)! ❌");
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply("الرجاء منشن العضو المراد تبنيده مع كتابة السبب! ⚠️");
        }

        const reason = args.slice(2).join(' ');
        if (!reason) {
            return message.reply("الرجاء كتابة سبب الباند بشكل إجباري! ❌");
        }

        const targetUserTag = targetMember.user.username;
        const targetUserId = targetMember.id;

        try {
            await targetMember.ban({ reason });
            await message.delete().catch(() => {});

            const successEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle("**تم تبنيد الشخص بنجاح ✅️ ⛔**")
                .setDescription(`**بواسطة :** <@${message.author.id}> | **الشخص :** <@${targetUserId}> | **السبب :** ${reason}`);

            await message.channel.send({ embeds: [successEmbed] });

            const banLogChannel = message.guild.channels.cache.get(CHANNELS.BAN_LOG);
            if (banLogChannel) {
                const banEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setDescription(
                        `** تم اعطاء باند | Ban **\n\n\n\n` +
                        `**الشخص المتبند :**\n` +
                        `يوزر : ${targetUserTag}\n` +
                        `ألايدي : ${targetUserId}\n\n\n\n` +
                        `**الاداري الي معطي الباند :**\n` +
                        `<@${message.author.id}>\n\n\n\n` +
                        `**سبب وضع الباند :**\n` +
                        `[${reason}]\n\n\n` +
                        `** **`
                    )
                    .setTimestamp();

                await banLogChannel.send({ embeds: [banEmbed] });
            }
        } catch (err) {
            console.error(err);
            return message.channel.send("تعذر تبنيد العضو، يرجى التأكد من صلاحيات البوت! ❌");
        }
        return;
    }

    if (command === '-تعال') {
        if (!message.member.roles.cache.has(ROLES.BAN_PERMISSION)) {
            return message.reply("عذراً، لا يمكنك استخدام هذا الأمر إلا للرتبة المخصصة (تصريح باند)! ❌");
        }

        const userId = args[1]?.replace(/[^0-9]/g, '');
        if (!userId) {
            return message.reply("الرجاء كتابة أيدي العضو أو منشنته لفك الباند عنه! ⚠️");
        }

        try {
            await message.guild.members.unban(userId);
            await message.delete().catch(() => {});
            return message.channel.send(`تم فك الحظر عن العضو <@${userId}> بنجاح ✅`);
        } catch (err) {
            return message.channel.send("لم يتم العثور على العضو في قائمة الحظر! ❌");
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;

    if (interaction.isChatInputCommand()) {
        const { commandName, member, guild } = interaction;

        if (['alltimeout', 'allban', 'alluntimeout', 'allunban'].includes(commandName)) {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: "عذراً، هذا الأمر مخصص لأصحاب صلاحيات الأدمنستريتور (Administrator) فقط! ❌", ephemeral: false });
            }
        }

        if (commandName === 'alltimeout') {
            await interaction.deferReply({ ephemeral: false });
            const members = await guild.members.fetch();
            const timedOutMembers = members.filter(m => m.isCommunicationDisabled());

            if (timedOutMembers.size === 0) {
                return interaction.editReply({ content: "لا يوجد أعضاء عليهم تايم أوت حالياً في السيرفر! 🛡️" });
            }

            let desc = "";
            let index = 1;
            const sorted = Array.from(timedOutMembers.values());

            for (const m of sorted) {
                desc += `**${index}.** <@${m.id}> (\`${m.id}\`)\n   • **الحالة:** مكتوم مؤقتاً\n\n`;
                index++;
            }

            const embed = new EmbedBuilder()
                .setColor(0xFFFF00)
                .setTitle(`**قائمة الأعضاء الذين عليهم تايم أوت (الإجمالي: ${timedOutMembers.size}) ⏱️**`)
                .setDescription(desc)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'allban') {
            await interaction.deferReply({ ephemeral: false });
            const bans = await guild.bans.fetch();

            if (bans.size === 0) {
                return interaction.editReply({ content: "لا يوجد أعضاء مبندين في السيرفر حالياً! 🛡️" });
            }

            const banArray = Array.from(bans.values());
            let desc = "";
            let index = 1;

            for (const b of banArray) {
                const reason = b.reason || "بدون سبب مدخل";
                desc += `**${index}.** **${b.user.tag}** (\`${b.user.id}\`)\n   • **السبب:** ${reason}\n\n`;
                index++;
                if (index > 25) break;
            }

            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(`**قائمة الأعضاء المبندين (من الأقدم للأحدث) ⛔**`)
                .setDescription(desc)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'alluntimeout') {
            await interaction.deferReply({ ephemeral: false });
            const members = await guild.members.fetch();
            const timedOutMembers = members.filter(m => m.isCommunicationDisabled());

            if (timedOutMembers.size === 0) {
                return interaction.editReply({ content: "لا يوجد أعضاء عليهم تايم أوت لإزالته! 🛡️" });
            }

            let count = 0;
            for (const [id, m] of timedOutMembers) {
                await m.timeout(null).catch(() => {});
                count++;
            }

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle("**تم إزالة التايم أوت عن الجميع بنجاح ✅**")
                .setDescription(`تمت إزالة التايم أوت عن إجمالي **${count}** عضو.`);

            return interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'allunban') {
            await interaction.deferReply({ ephemeral: false });
            const bans = await guild.bans.fetch();

            if (bans.size === 0) {
                return interaction.editReply({ content: "لا يوجد أعضاء مبندين لفك الحظر عنهم! 🛡️" });
            }

            let count = 0;
            for (const [id, ban] of bans) {
                await guild.members.unban(id).catch(() => {});
                count++;
            }

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle("**تم فك الباند عن جميع المبندين بنجاح ✅**")
                .setDescription(`تمت إزالة الحظر عن إجمالي **${count}** عضو.`);

            return interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'laboratory-session') {
            if (!member.roles.cache.has(ROLES.LAB_ROLE)) {
                return interaction.reply({ content: "عذراً، هذا الأمر خاص برتبة مختبرين محددة فقط! ❌", ephemeral: false });
            }

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');
            const targetChannel = guild.channels.cache.get(CHANNELS.LAB_LOG);

            if (!targetChannel) {
                return interaction.reply({ content: "روم فصل المختبرين غير محدد أو غير موجود! ❌", ephemeral: false });
            }

            const labEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setDescription(
                    `**__إيمبد فصل مختبر__**\n\n` +
                    `عزيز المسؤول <@${interaction.user.id}>\n\n` +
                    `**تم فصل:** <@${targetUser.id}>\n\n` +
                    `**سبب الفصل:** [ ${reason} ]`
                )
                .setTimestamp();

            await targetChannel.send({ embeds: [labEmbed] });
            return interaction.reply({ content: "تم إرسال بلاغ الفصل بنجاح إلى روم المختبرين! ✅", ephemeral: false });
        }

        if (commandName === 'setup-tickets') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: "عذراً، هذا الأمر للأصحاب الصلاحيات (Administrator) فقط! ❌", ephemeral: false });
            }

            await interaction.deferReply({ ephemeral: false });

            // بنر التذاكر الرئيسي مع الترتيب المطلوب (مسافة وقبل الأخير نتمنى منكم عدم الاستهبال)
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("**من هنا يمكنكم فتح تذكرة 🤍.**")
                
                .setDescription(
                    "**فتح تذكرة ل الأمور هاذي 👇🏼**\n\n" +
                    "**1- اعتراض على الباند**\n" +
                    "**2- تذكرة التعويض**\n" +
                    "**3- تذكرة الدعم الفني**\n\n" +
                    
                    "**الرجاء الإجابة على الأسئلة لخدمتك بشكل أفضل 🤍.**\n\n\n" +
                    
                    "**نتمنى منكم عدم الاستهبال ⚠️🪧!**\n\n" +
                    
                    "**وشكرا لكم...🤍**"
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_support').setLabel('فتح تذكرة الدعم الفني 🧑‍💻').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('open_ban').setLabel('اعتراض على الباند ⛔️').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('open_comp').setLabel('طلب تعويض 🗂').setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.editReply({ content: "تم إرسال بنر التذاكر بنجاح! ✅" });
        }

        if (commandName === 'pointict') {
            const config = getGuildConfig(guild.id);
            const pointsObj = config.points || {};
            const sortedPoints = Object.entries(pointsObj).sort((a, b) => b[1] - a[1]);
            
            let desc = sortedPoints.length > 0 
                ? sortedPoints.map(([id, pts], index) => `**${index + 1}** <@${id}> : **${pts}**`).join('\n') 
                : 'لا توجد نقاط مسجلة حالياً.';

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle("**نقاط التذاكر 📊**")
                .setDescription(desc);

            return interaction.reply({ embeds: [embed], ephemeral: false });
        }

        if (commandName === 'restpointict') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: "هذا الأمر للإدارة العليا فقط! ❌", ephemeral: false });
            }
            const config = getGuildConfig(guild.id);
            config.points = {};
            saveGuildConfig(guild.id, config);
            return interaction.reply({ content: "تم تصفير نقاط الفريق الإداري بنجاح! 🔄", ephemeral: false });
        }
    }

    if (interaction.isButton() && ['open_support', 'open_ban', 'open_comp'].includes(interaction.customId)) {
        const existingTicket = [...activeTickets.values()].find(t => t.userId === interaction.user.id && t.guildId === interaction.guild.id);
        if (existingTicket) {
            return interaction.reply({ content: "عذراً، لديك تذكرة مفتوحة مسبقاً ولا يمكنك فتح أكثر من تذكرة واحدة! ❌", ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId(`ticket_modal_${interaction.customId}`)
            .setTitle('بيانات فتح التذكرة الإجبارية 📝');

        const q1 = new TextInputBuilder()
            .setCustomId('q1_name')
            .setLabel('1- اسمك الكريم')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const q2 = new TextInputBuilder()
            .setCustomId('q2_roblox')
            .setLabel('2- يوزرك روبلوكس')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const q3 = new TextInputBuilder()
            .setCustomId('q3_reason')
            .setLabel('3- سبب فتح التذكرة')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const q4 = new TextInputBuilder()
            .setCustomId('q4_proof')
            .setLabel('4- هل يوجد دليل؟')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(q1),
            new ActionRowBuilder().addComponents(q2),
            new ActionRowBuilder().addComponents(q3),
            new ActionRowBuilder().addComponents(q4)
        );

        return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
        const btnType = interaction.customId.replace('ticket_modal_', '');
        let ticketType = "الدعم الفني";
        if (btnType === 'open_ban') ticketType = "اعتراض على الباند";
        if (btnType === 'open_comp') ticketType = "طلب تعويض";

        const nameAns = interaction.fields.getTextInputValue('q1_name');
        const robloxAns = interaction.fields.getTextInputValue('q2_roblox');
        const reasonAns = interaction.fields.getTextInputValue('q3_reason');
        const proofAns = interaction.fields.getTextInputValue('q4_proof');

        await interaction.deferReply({ ephemeral: true });

        let config = getGuildConfig(interaction.guild.id);
        config.ticketCounter = (config.ticketCounter || 0) + 1;
        saveGuildConfig(interaction.guild.id, config);

        const ticketName = `ticket-${config.ticketCounter}`;

        const overwrites = [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: ROLES.STAFF, deny: [PermissionsBitField.Flags.SendMessages], allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: ROLES.BAN_TEAM, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: ROLES.SUPPORT, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: ROLES.COMPENSATION, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
        ];

        const ticketChannel = await interaction.guild.channels.create({
            name: ticketName,
            type: ChannelType.GuildText,
            parent: CHANNELS.CATEGORY,
            permissionOverwrites: overwrites,
        });

        // إمبد فتح التذكرة باللون الذهبي/البرتقالي، يعرض نوع التذكرة بدقة والنص المطلوب
        const embed1 = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle(`**🎫 تذكرة [ ${ticketType} ]**`)
            .setDescription(
                `**تم فتح التذكرة الخاصة بك. الرجاء منك انتظار الإداري.**\n` +
                `**نتمنى منك عدم الاستهبال ⚠️🪧!**`
            );

        const embed2 = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setDescription(
                `**• ما سبب فتح التذكرة ؟:**\n\`\`\`${reasonAns}\`\`\`\n` +
                
                `📌 **1- الاسم الكريم:**\n\`\`\`${nameAns}\`\`\`\n` +
                
                `🎮 **2- يوزر روبلوكس:**\n\`\`\`${robloxAns}\`\`\`\n` +
                
                `📁 **3- هل يوجد دليل؟:**\n\`\`\`${proofAns}\`\`\``
            );

        // ترتيب الأزرار مثل الصورة تماماً (بدون زر الأونر)
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('استلام').setStyle(ButtonStyle.Success).setEmoji('📌')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('opt_summon').setLabel('استدعاء الاداري').setStyle(ButtonStyle.Primary).setEmoji('👤'),
            new ButtonBuilder().setCustomId('opt_support_summon').setLabel('استدعاء السبورت').setStyle(ButtonStyle.Secondary).setEmoji('🔔')
        );

        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('opt_move_menu_btn').setLabel('نقل التذكرة').setStyle(ButtonStyle.Primary).setEmoji('🔄')
        );

        // قائمة تعديل التذكرة (Select Menu) مطابقة للصورة
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_manage_menu')
            .setPlaceholder('⚙️ تعديل التذكرة')
            .addOptions([
                {
                    label: 'استدعاء صاحب التذكرة',
                    description: 'منشن صاحب التذكرة للحضور',
                    value: 'come_user',
                    emoji: '👋'
                },
                {
                    label: 'تغيير اسم التذكرة',
                    description: 'تعديل اسم الروم الحالي',
                    value: 'rename_ticket',
                    emoji: '✏️'
                },
                {
                    label: 'إضافة عضو للتذكرة',
                    description: 'منح صلاحية الرؤية والكتابة لعضو',
                    value: 'add_user',
                    emoji: '➕'
                },
                {
                    label: 'إزالة عضو من التذكرة',
                    description: 'سحب الصلاحية من عضو',
                    value: 'remove_user',
                    emoji: '➖'
                }
            ]);

        const menuRow = new ActionRowBuilder().addComponents(selectMenu);

        const cleanMention = `<@&${ROLES.STAFF}>\n<@${interaction.user.id}>`;

        await ticketChannel.send({ 
            content: cleanMention, 
            embeds: [embed1, embed2], 
            components: [row1, row2, row3, menuRow] 
        });

        const now = new Date();
        const formattedOpenDate = now.toLocaleString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
        });

        activeTickets.set(ticketChannel.id, {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            ticketTypeName: ticketType,
            claimedBy: null,
            createdAtFormatted: formattedOpenDate,
            timer: null,
            supportCalled: false,
            adminCalled: false
        });

        return interaction.editReply({ content: `تم فتح تذكرتك بنجاح هنا: <#${ticketChannel.id}> 🎟` });
    }

    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    const checkCooldown = (userId) => {
        const cooldownTime = 30 * 1000;
        const lastTime = renameCooldowns.get(userId) || 0;
        const now = Date.now();
        if (now - lastTime < cooldownTime) {
            const remaining = Math.ceil((cooldownTime - (now - lastTime)) / 1000);
            return remaining;
        }
        return 0;
    };

    // معالجة القائمة المنسدلة (Select Menu) لتعديل التذكرة
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_manage_menu') {
        const { member, channel, values } = interaction;
        
        if (!member.roles.cache.has(ROLES.STAFF) && member.id !== activeTickets.get(channel.id)?.userId) {
            return interaction.reply({ content: "ليس لديك صلاحية لاستخدام هذه القائمة ❌", ephemeral: true });
        }

        const selectedVal = values[0];

        if (selectedVal === 'come_user') {
            const ticketData = activeTickets.get(channel.id);
            if (!ticketData) return interaction.reply({ content: "خطأ في بيانات التذكرة!", ephemeral: true });
            await channel.send(`حياك الله <@${ticketData.userId}> تفضل بوضع استفسارك أو مشكلتك 🤍.`);
            return interaction.reply({ content: "تم استدعاء صاحب التذكرة بنجاح! ✅", ephemeral: true });
        }

        if (selectedVal === 'rename_ticket') {
            if (!member.roles.cache.has(ROLES.STAFF)) {
                return interaction.reply({ content: "تغيير اسم التذكرة مخصص للفريق الإداري فقط! ❌", ephemeral: true });
            }
            const modal = new ModalBuilder()
                .setCustomId('custom_rename_modal')
                .setTitle('تغيير اسم التذكرة 🎫');

            const nameInput = new TextInputBuilder()
                .setCustomId('new_ticket_name')
                .setLabel('اكتب اسم التذكرة الجديد')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
            return interaction.showModal(modal);
        }

        if (selectedVal === 'add_user') {
            if (!member.roles.cache.has(ROLES.STAFF)) {
                return interaction.reply({ content: "هذا الإجراء لفريق الإدارة فقط! ❌", ephemeral: true });
            }
            const modal = new ModalBuilder()
                .setCustomId('add_member_modal')
                .setTitle('إضافة عضو للتذكرة ➕');

            const input = new TextInputBuilder()
                .setCustomId('target_user_id')
                .setLabel('اكتب أيدي (ID) العضو أو منشنه')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (selectedVal === 'remove_user') {
            if (!member.roles.cache.has(ROLES.STAFF)) {
                return interaction.reply({ content: "هذا الإجراء لفريق الإدارة فقط! ❌", ephemeral: true });
            }
            const modal = new ModalBuilder()
                .setCustomId('remove_member_modal')
                .setTitle('إزالة عضو من التذكرة ➖');

            const input = new TextInputBuilder()
                .setCustomId('target_user_id')
                .setLabel('اكتب أيدي (ID) العضو المراد إزالته')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
    }

    if (interaction.isButton()) {
        const { customId, channel, guild, member, user } = interaction;
        let config = getGuildConfig(guild.id);

        if (customId === 'claim_ticket') {
            if (!member.roles.cache.has(ROLES.STAFF)) {
                return interaction.reply({ content: "عذراً، هذا الزر خاص بفريق الإدارة فقط! ❌", ephemeral: true });
            }
            const ticketData = activeTickets.get(channel.id);
            if (ticketData && ticketData.claimedBy) {
                return interaction.reply({ content: `تم استلام هذه التذكرة مسبقاً بواسطة <@${ticketData.claimedBy}>! ⚠️`, ephemeral: true });
            }

            if (ticketData) ticketData.claimedBy = user.id;

            await channel.permissionOverwrites.edit(user.id, {
                SendMessages: true,
                ViewChannel: true,
                ReadMessageHistory: true
            }).catch(() => {});

            const pointsObj = config.points || {};
            pointsObj[user.id] = (pointsObj[user.id] || 0) + 1;
            config.points = pointsObj;
            saveGuildConfig(guild.id, config);

            const pointsEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setDescription(`تم اعطائك 1 نقطة نقاطك الان** ** : ${pointsObj[user.id]}`);

            const subRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('claim_request').setLabel('طلب استلام 📌').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('leave_ticket').setLabel('ترك ⛔️').setStyle(ButtonStyle.Danger)
            );

            await channel.send({ 
                content: `<@${user.id}>`, 
                embeds: [pointsEmbed], 
                components: [subRow] 
            });

            return interaction.reply({ content: "تم الاستلام بنجاح.", ephemeral: true });
        }

        // زر طلب الاستلام (مع التحقق من أن المستلم لا يطلب من نفسه، ومنشن الإداري المستلم بدون أيدي)
        if (customId === 'claim_request') {
            if (!member.roles.cache.has(ROLES.STAFF)) {
                return interaction.reply({ content: "عذراً، هذا الزر خاص بفريق الإدارة فقط! ❌", ephemeral: true });
            }
            const ticketData = activeTickets.get(channel.id);
            if (!ticketData || !ticketData.claimedBy) {
                return interaction.reply({ content: "يجب استلام التذكرة أولاً قبل إرسال طلب استلام ثانوي! ⚠️", ephemeral: true });
            }

            // منع المستلم من طلب الاستلام من نفسه
            if (ticketData.claimedBy === user.id) {
                return interaction.reply({ content: "لا يمكنك طلب استلام تذكرتك بنفسك! ❌", ephemeral: true });
            }

            const requestEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setDescription(`**تم جاك طلب استلام من <@${user.id}>**\n**هل تريد قبوله أو رفضه؟**`)
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`accept_sub_claim_${user.id}`).setLabel('قبول الطلب ✅️').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('reject_claim').setLabel('رفض الطلب ❌️').setStyle(ButtonStyle.Danger)
            );

            // منشن الإداري المستلم الأصلي
            await channel.send({ 
                content: `<@${ticketData.claimedBy}>`, 
                embeds: [requestEmbed], 
                components: [row] 
            });

            return interaction.reply({ content: "تم إرسال طلب الاستلام إلى مستلم التذكرة بنجاح! ✅", ephemeral: true });
        }

        if (customId.startsWith('accept_sub_claim_') || customId === 'reject_claim') {
            if (!member.roles.cache.has(ROLES.STAFF)) {
                return interaction.reply({ content: "عذراً، هذا القرار خاص بفريق الإدارة فقط! ❌", ephemeral: true });
            }

            if (customId === 'reject_claim') {
                await interaction.update({ content: "تم رفض طلب الاستلام. ❌", embeds: [], components: [] });
                return;
            }

            const targetStaffId = customId.replace('accept_sub_claim_', '');
            
            if (user.id === targetStaffId) {
                return interaction.reply({ content: "عذراً، لا يمكنك قبول طلبك بنفسك! ❌", ephemeral: true });
            }

            await channel.permissionOverwrites.edit(targetStaffId, {
                SendMessages: true,
                ViewChannel: true,
                ReadMessageHistory: true
            }).catch(() => {});

            await interaction.update({ embeds: [], components: [] });

            const acceptEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle("**تم قبول الإداري المساعد ✅**")
                .setDescription(`**تم إضافة العضو للإدارة المساعدة في التذكرة:** <@${targetStaffId}> 👤`)
                .setTimestamp();

            await channel.send({ embeds: [acceptEmbed] });
            return;
        }

        // استدعاء الإداري (يُضغط مرة واحدة إذا لم تُستلم)
        if (customId === 'opt_summon') {
            const ticketData = activeTickets.get(channel.id);
            if (ticketData && ticketData.claimedBy) {
                return interaction.reply({ content: "تم استلام التذكرة مسبقاً من قِبل إداري ولا يمكن الاستدعاء الآن! ⚠️", ephemeral: true });
            }
            if (ticketData && ticketData.adminCalled) {
                return interaction.reply({ content: "لقد تم استدعاء فريق الإدارة مسبقاً في هذه التذكرة! ⚠️", ephemeral: true });
            }

            if (ticketData) ticketData.adminCalled = true;
            await channel.send(`تم استدعاء الإداري ✅ <@&${ROLES.STAFF}>`);
            return interaction.reply({ content: "تم استدعاء فريق الإدارة بنجاح.", ephemeral: true });
        }

        // استدعاء السبورت (يُضغط مرة واحدة)
        if (customId === 'opt_support_summon') {
            const ticketData = activeTickets.get(channel.id);
            if (ticketData && ticketData.claimedBy) {
                return interaction.reply({ content: "تم استلام التذكرة مسبقاً ولا يمكن الاستدعاء الآن! ⚠️", ephemeral: true });
            }
            if (ticketData && ticketData.supportCalled) {
                return interaction.reply({ content: "لقد تم استدعاء السبورت مسبقاً في هذه التذكرة! ⚠️", ephemeral: true });
            }

            if (ticketData) ticketData.supportCalled = true;
            await channel.send(`مطلوب مسؤولين الدعم الفني <@&${ROLES.STAFF}>\nالرجاء الانتظار 🤍.`);
            return interaction.reply({ content: "تم استدعاء السبورت بنجاح! ✅", ephemeral: true });
        }

        // نقل التذكرة للأقسام بالأسماء والشروط المطلوبة بالشرطات (ديكورد ستايل)
        if (customId === 'opt_move_menu_btn') {
            if (!member.roles.cache.has(ROLES.STAFF)) {
                return interaction.reply({ content: "هذا الزر لفريق الإدارة فقط! ❌", ephemeral: true });
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('move_to_ban').setLabel('قسم الباند 🔺️').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('move_to_comp').setLabel('قسم التعويض 💸').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('move_to_support').setLabel('الدعم الفني 🧑‍💻').setStyle(ButtonStyle.Secondary)
            );
            return interaction.reply({ content: "اختر القسم المراد نقل التذكرة إليه 🔄:", components: [row], ephemeral: true });
        }

        if (['move_to_ban', 'move_to_comp', 'move_to_support'].includes(customId)) {
            if (!member.roles.cache.has(ROLES.STAFF)) {
                return interaction.reply({ content: "غير مسموح لك بنقل التذكرة! ❌", ephemeral: true });
            }

            let roleId = ROLES.SUPPORT;
            let roleName = "مطلوب مسؤولين الدعم الفني";
            let newChannelName = "مطلوب-مسؤولين-الدعم-الفني";

            if (customId === 'move_to_ban') {
                roleId = ROLES.BAN_TEAM;
                roleName = "مطلوب مسؤولين الباند";
                newChannelName = "مطلوب-مسؤولين-الباند";
            } else if (customId === 'move_to_comp') {
                roleId = ROLES.COMPENSATION;
                roleName = "مطلوب مسؤولين التعويض";
                newChannelName = "مطلوب-مسؤولين-التعويض";
            }

            await channel.setName(newChannelName).catch(() => {});
            await channel.send(`تم نقل التذكرة إلى **${roleName}** بواسطة <@${user.id}> 🔄\nمنشن المسؤولين: <@&${roleId}>`);
            return interaction.update({ content: `تم نقل التذكرة بنجاح إلى قسم **${roleName}**! ✅`, components: [] });
        }

        if (customId === 'close_ticket') {
            if (!member.roles.cache.has(ROLES.STAFF)) {
                return interaction.reply({ content: "هذا الزر لفريق الإدارة فقط! ❌", ephemeral: true });
            }
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('delete_ticket').setLabel('حذف التذكرة 🗑').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('leave_ticket').setLabel('ترك التذكرة ⛔️').setStyle(ButtonStyle.Danger)
            );
            return interaction.reply({ content: "اختر إجراء الإغلاق:", components: [row], ephemeral: false });
        }

        // زر ترك التذكرة: مخصص لمستلم التذكرة فقط
        if (customId === 'leave_ticket') {
            const ticketData = activeTickets.get(channel.id);
            if (!ticketData || ticketData.claimedBy !== user.id) {
                return interaction.reply({ content: "عذراً، لا يمكنك ترك التذكرة لأنك لست المستلم الحالي لها! ❌", ephemeral: true });
            }

            const oldClaimer = ticketData.claimedBy;
            ticketData.claimedBy = null;

            await channel.permissionOverwrites.delete(oldClaimer).catch(() => {});

            const pointsObj = config.points || {};
            pointsObj[user.id] = Math.max(0, (pointsObj[user.id] || 1) - 1);
            config.points = pointsObj;
            saveGuildConfig(guild.id, config);

            const claimRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('claim_ticket').setLabel('استلام التذكرة ✅').setStyle(ButtonStyle.Success)
            );

            await channel.send(`الأدمن <@${oldClaimer}> ترك التذكرة وتم خصم نقطة **1** 📉`);
            await channel.send({ content: `الرجاء من الفريق الإداري استلام التذكرة <@&${ROLES.STAFF}>`, components: [claimRow] });
            return interaction.reply({ content: "تم ترك التذكرة بنجاح.", ephemeral: true });
        }

        if (customId === 'delete_ticket') {
            const ticketData = activeTickets.get(channel.id);
            await interaction.reply({ content: " ** جاري إغلاق التذكرة وتوليد سجل المحادثات... 🔄 ** ", ephemeral: false });

            let attachment = null;
            if (discordTranscripts) {
                try {
                    attachment = await discordTranscripts.createTranscript(channel, {
                        limit: -1,
                        returnType: 'attachment',
                        filename: `${channel.name}.html`,
                        saveImages: true,
                        poweredBy: false
                    });
                } catch (err) {
                    console.error("خطأ في توليد الترانسبيرت:", err);
                }
            }

            const closeDateObj = new Date();
            const formattedCloseDate = closeDateObj.toLocaleString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric', 
                hour: 'numeric', 
                minute: '2-digit', 
                hour12: true 
            });

            const logEmbed = new EmbedBuilder()
                .setColor(0x2F3136)
                .setTitle("**🔒 | سجل إغلاق تذكرة جديدة**")
                
                .setDescription("**تم إغلاق التذكرة بنجاح وحفظ تفاصيلها أدناه:**")
                .addFields(
                    
                    { name: "**📌 اسم التذكرة:**", value: `\`${channel.name}\``, inline: true },
                    
                    { name: "**🎫 نوع التذكرة:**", value: `\`${ticketData ? ticketData.ticketTypeName : 'غير معروف'}\``, inline: true },
                    
                    { name: "\u200b", value: "\u200b", inline: false },
                    
                    { name: "**👤 صاحب التذكرة:**", value: `<@${ticketData ? ticketData.userId : 'غير معروف'}>`, inline: true },
                    
                    { name: "**🛡️ مستلم التذكرة:**", value: `${ticketData && ticketData.claimedBy ? `<@${ticketData.claimedBy}>` : '**لم يتم الاستلام**'}`, inline: true },
                    
                    { name: "\u200b", value: "\u200b", inline: false },

                    { name: "**🛠️ حذفت التذكرة بواسطة:**", value: `<@${user.id}>`, inline: true },
                    
                    { name: "**⏱️ وقت فتحها:**", value: `\`${ticketData ? ticketData.createdAtFormatted : 'غير متوفر'}\``, inline: false },
                    
                    { name: "**🏁 وقت إغلاقها:**", value: `\`${formattedCloseDate}\``, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: "Lw Studio Bot • Log Archives", iconURL: guild.iconURL() });

            if (CHANNELS.LOG) {
                const logChan = guild.channels.cache.get(CHANNELS.LOG);
                if (logChan) {
                    const sendPayload = { embeds: [logEmbed] };
                    if (attachment) sendPayload.files = [attachment];
                    await logChan.send(sendPayload).catch(e => console.error(e));
                }
            }

            if (ticketData && ticketData.userId) {
                try {
                    const ticketOwner = await client.users.fetch(ticketData.userId).catch(() => null);
                    if (ticketOwner) {
                        const dmPayload = { embeds: [logEmbed] };
                        if (attachment) {
                            const dmAttachment = await discordTranscripts.createTranscript(channel, {
                                limit: -1,
                                returnType: 'attachment',
                                filename: `${channel.name}.html`,
                                saveImages: true,
                                poweredBy: false
                            });
                            dmPayload.files = [dmAttachment];
                        }
                        await ticketOwner.send(dmPayload).catch(() => {});
                    }
                } catch (dmErr) {
                    console.error("تعذر إرسال السجل لخاص العضو:", dmErr);
                }
            }

            activeTickets.delete(channel.id);
            setTimeout(() => channel.delete().catch(() => {}), 5000);
            return;
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'custom_rename_modal') {
            const timeLeft = checkCooldown(interaction.user.id);
            if (timeLeft > 0) {
                return interaction.reply({ content: `عذراً، يجب عليك الانتظار **${timeLeft}** ثانية قبل تغيير اسم التذكرة مرة أخرى! ⏳`, ephemeral: true });
            }

            const newName = interaction.fields.getTextInputValue('new_ticket_name');
            renameCooldowns.set(interaction.user.id, Date.now());

            await interaction.channel.setName(newName).catch(() => {});
            return interaction.reply({ content: `تم تغيير اسم التذكرة إلى: **${newName}** بنجاح! ✅`, ephemeral: true });
        }

        if (interaction.customId === 'add_member_modal') {
            const rawInput = interaction.fields.getTextInputValue('target_user_id').replace(/[^0-9]/g, '');
            const targetMember = await interaction.guild.members.fetch(rawInput).catch(() => null);

            if (!targetMember) {
                return interaction.reply({ content: "عذراً، لم يتم العثور على العضو بهذا الأيدي! ❌", ephemeral: true });
            }

            await interaction.channel.permissionOverwrites.edit(targetMember.id, {
                SendMessages: true,
                ViewChannel: true,
                ReadMessageHistory: true
            }).catch(() => {});

            return interaction.reply({ content: `تم إضافة العضو <@${targetMember.id}> إلى التذكرة بنجاح! ✅`, ephemeral: true });
        }

        if (interaction.customId === 'remove_member_modal') {
            const rawInput = interaction.fields.getTextInputValue('target_user_id').replace(/[^0-9]/g, '');
            const targetMember = await interaction.guild.members.fetch(rawInput).catch(() => null);

            if (!targetMember) {
                return interaction.reply({ content: "عذراً، لم يتم العثور على العضو بهذا الأيدي! ❌", ephemeral: true });
            }

            await interaction.channel.permissionOverwrites.delete(targetMember.id).catch(() => {});

            return interaction.reply({ content: `تم إزالة العضو <@${targetMember.id}> من التذكرة بنجاح! 🚫`, ephemeral: true });
        }
    }
});

const token = process.env.DISCORD_TOKEN;
client.login(token);
