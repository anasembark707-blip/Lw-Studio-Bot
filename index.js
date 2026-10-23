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
    TextInputStyle
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
    res.send('WL Studio Bot is active and running! 🚀');
});

app.listen(PORT, () => {
    console.log(`Web server is listening on port ${PORT}`);
});

const dbPath = path.join(__dirname, 'database.json');

const ROLES = {
    STAFF: "1557096881140535469",         // فريق الإدارة
    BAN_TEAM: "1557095186935455755",     // مسؤولين الباند
    SUPPORT: "1557095817427558420",      // مسؤولين الدعم الفني
    COMPENSATION: "1545853973922058281", // مسؤولين التعويض
    LAB_ROLE: "1546001638278434936"      // رتبه نظام الفصل
};

const CHANNELS = {
    LOG: "1550972645976309781",          // روم لوق تكتات
    CATEGORY: "1550992320835362846",     // كاتجوري تكتات تفعيل
    LAB_LOG: "1555934771274719362"       // روم فصل المختبرين
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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const activeTickets = new Map();
const renameCooldowns = new Map();

client.once('ready', async () => {
    console.log(`تم تسجيل الدخول بنجاح باسم ${client.user.tag}! البوت جاهز.`);

    client.user.setPresence({
        activities: [{ name: 'Tickets System by أبو غمدة', type: ActivityType.Watching }],
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
                    .setRequired(true))
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

client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;

    if (interaction.isChatInputCommand()) {
        const { commandName, member, guild } = interaction;

        if (commandName === 'laboratory-session') {
            if (!member.roles.cache.has(ROLES.LAB_ROLE)) {
                return interaction.reply({ content: "عذراً، هذا الأمر خاص برتبة مختبرين محددة فقط! ❌", ephemeral: true });
            }

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');
            const targetChannel = guild.channels.cache.get(CHANNELS.LAB_LOG);

            if (!targetChannel) {
                return interaction.reply({ content: "روم فصل المختبرين غير محدد أو غير موجود! ❌", ephemeral: true });
            }

            const labEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setDescription(
                    `**__إيمبد فصل مختبر__**\n\n` +
                    `عزيز المسؤول <@${interaction.user.id}>\n\n` +
                    `تم فصل <@${targetUser.id}>\n\n` +
                    `سبب الفصل [${reason}]`
                )
                .setTimestamp();

            await targetChannel.send({ embeds: [labEmbed] });
            return interaction.reply({ content: "تم إرسال بلاغ الفصل بنجاح إلى روم المختبرين! ✅", ephemeral: true });
        }

        if (commandName === 'setup-tickets') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: "عذراً، هذا الأمر للأصحاب الصلاحيات (Administrator) فقط! ❌", ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("من هنا يمكنكم فتح تذكرة 🤍.")
                .setDescription(
                    "فتح تذكرة ل الأمور هاذي 👇🏼\n\n" +
                    "1- اعتراض على الباند\n" +
                    "2- تذكرة التعويض\n" +
                    "3- تذكرة الدعم الفني\n\n" +
                    "يمنع منعاً باتاً ان تفتح تذكرة ل الاستهبال 🪧\n" +
                    "قم فقط ب الإجابة على الأسئلة ل خدمتك ب شكل افضل 🤍.\n\n" +
                    "وشكرا لكم...🤍"
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
                ? sortedPoints.map(([id, pts], index) => `${index + 1} <@${id}> :${pts}`).join('\n') 
                : 'لا توجد نقاط مسجلة حالياً.';

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle("نقاط التذاكر 📊")
                .setDescription(desc);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'restpointict') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: "هذا الأمر للإدارة العليا فقط! ❌", ephemeral: true });
            }
            const config = getGuildConfig(guild.id);
            config.points = {};
            saveGuildConfig(guild.id, config);
            return interaction.reply({ content: "تم تصفير نقاط الفريق الإداري بنجاح! 🔄", ephemeral: true });
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

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`تم فتح تذكرة [ ${ticketType} ]`)
            .setDescription(
                "انت الان بـ التذكرة نتمنى عدم الاستهبال 🪧.\n\n" +
                `📌 **1- الاسم الكريم:** ${nameAns}\n` +
                `🎮 **2- يوزر روبلوكس:** ${robloxAns}\n` +
                `❓ **3- سبب فتح التذكرة:** ${reasonAns}\n` +
                `📁 **4- هل يوجد دليل؟:** ${proofAns}`
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_options').setLabel('خيارات التذكرة ⚙').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التذكرة ❌️').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('استلام التذكرة ✅').setStyle(ButtonStyle.Success)
        );

        const cleanMention = `<@&${ROLES.STAFF}>\n<@${interaction.user.id}>`;

        await ticketChannel.send({ 
            content: cleanMention, 
            embeds: [embed], 
            components: [row] 
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
            claimMessageId: null
        });

        return interaction.editReply({ content: `تم فتح تذكرتك بنجاح هنا: <#${ticketChannel.id}> 🎟` });
    }

    if (!interaction.isButton() && !interaction.isModalSubmit()) return;

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

    if (interaction.isButton()) {
        const { customId, channel, guild, member, user } = interaction;
        let config = getGuildConfig(guild.id);

        if (customId === 'claim_ticket') {
            if (!member.roles.cache.has(ROLES.STAFF)) {
                return interaction.reply({ content: "هذا الزر خاص بفريق الإدارة فقط! ❌", ephemeral: true });
            }
            const ticketData = activeTickets.get(channel.id);
            if (ticketData && ticketData.claimedBy) {
                return interaction.reply({ content: `تم استلام هذه التذكرة مسبقاً بواسطة <@${ticketData.claimedBy}> ! ⚠️`, ephemeral: true });
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

            const claimEmbed = new EmbedBuilder()
                .setColor(0x2B2D31)
                .setTitle("Claim Ticket")
                .setDescription(`تم استلام التذكرة بواسطة: .🔔<@${user.id}>`)
                .setThumbnail(guild.iconURL({ dynamic: true }));

            const claimRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('request_transfer').setLabel('طلب استلام 📌').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('leave_ticket').setLabel('ترك ⛔').setStyle(ButtonStyle.Danger)
            );

            const sentMsg = await channel.send({ 
                content: `<@${user.id}>`, 
                embeds: [claimEmbed], 
                components: [claimRow] 
            });

            if (ticketData) ticketData.claimMessageId = sentMsg.id;

            return interaction.reply({ 
                content: `تم اعطائك 1 نقطة نقاطك الان : ${pointsObj[user.id]}`, 
                ephemeral: true 
            });
        }

        if (customId === 'request_transfer') {
            if (!member.roles.cache.has(ROLES.STAFF)) {
                return interaction.reply({ content: "هذا الزر لفريق الإدارة فقط! ❌", ephemeral: true });
            }
            const ticketData = activeTickets.get(channel.id);
            if (!ticketData || !ticketData.claimedBy) {
                return interaction.reply({ content: "التذكرة غير مستلمة حالياً! ❌", ephemeral: true });
            }
            if (ticketData.claimedBy === user.id) {
                return interaction.reply({ content: "أنت مستلم التذكرة بالفعل! ⚠️", ephemeral: true });
            }

            const reqRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`accept_transfer_${user.id}`).setLabel('قبول ✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_transfer_${user.id}`).setLabel('رفض ❌').setStyle(ButtonStyle.Danger)
            );

            await channel.send({
                content: `<@${ticketData.claimedBy}>، يرغب الإداري <@${user.id}> باستلام التذكرة منك. هل توافق؟`,
                components: [reqRow]
            });

            return interaction.reply({ content: "تم إرسال طلب استلام التذكرة للمستلم الحالي بنجاح! 📌", ephemeral: true });
        }

        if (customId.startsWith('accept_transfer_')) {
            const requesterId = customId.replace('accept_transfer_', '');
            const ticketData = activeTickets.get(channel.id);

            if (!ticketData || ticketData.claimedBy !== user.id) {
                return interaction.reply({ content: "عذراً، فقط مستلم التذكرة الحالي يمكنه إجابة الطلب! ❌", ephemeral: true });
            }

            ticketData.claimedBy = requesterId;

            await channel.permissionOverwrites.edit(requesterId, {
                SendMessages: true,
                ViewChannel: true,
                ReadMessageHistory: true
            }).catch(() => {});

            if (ticketData.claimMessageId) {
                try {
                    const claimMsg = await channel.messages.fetch(ticketData.claimMessageId);
                    if (claimMsg) {
                        const updatedEmbed = new EmbedBuilder()
                            .setColor(0x2B2D31)
                            .setTitle("Claim Ticket")
                            .setDescription(`تم استلام التذكرة بواسطة: .🔔<@${requesterId}>`)
                            .setThumbnail(guild.iconURL({ dynamic: true }));

                        await claimMsg.edit({ content: `<@${requesterId}>`, embeds: [updatedEmbed] });
                    }
                } catch (e) {}
            }

            await interaction.message.delete().catch(() => {});
            return channel.send(`تم نقل استلام التذكرة بنجاح إلى <@${requesterId}> (بدون إضافة نقطة) ✅`);
        }

        if (customId.startsWith('reject_transfer_')) {
            const requesterId = customId.replace('reject_transfer_', '');
            const ticketData = activeTickets.get(channel.id);

            if (!ticketData || ticketData.claimedBy !== user.id) {
                return interaction.reply({ content: "عذراً، فقط مستلم التذكرة الحالي يمكنه إجابة الطلب! ❌", ephemeral: true });
            }

            await interaction.message.delete().catch(() => {});
            return channel.send(`رفض <@${user.id}> طلب نقل التذكرة للإداري <@${requesterId}> ❌`);
        }

        if (customId === 'leave_ticket') {
            const ticketData = activeTickets.get(channel.id);
            if (ticketData && ticketData.claimedBy) {
                if (!member.roles.cache.has(ROLES.STAFF)) {
                    return interaction.reply({ content: "هذا الزر لفريق الإدارة فقط! ❌", ephemeral: true });
                }

                const oldClaimer = ticketData.claimedBy;
                ticketData.claimedBy = null;

                await channel.permissionOverwrites.delete(oldClaimer).catch(() => {});

                const pointsObj = config.points || {};
                pointsObj[oldClaimer] = Math.max(0, (pointsObj[oldClaimer] || 1) - 1);
                config.points = pointsObj;
                saveGuildConfig(guild.id, config);

                const claimRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('claim_ticket').setLabel('استلام التذكرة ✅').setStyle(ButtonStyle.Success)
                );

                await channel.send(`ترك الإداري المستلم <@${oldClaimer}> التذكرة وتم خصم نقطة 1 📉`);
                await channel.send({ content: `الرجاء من الفريق الإداري استلام التذكرة <@&${ROLES.STAFF}>`, components: [claimRow] });
            }
            return interaction.reply({ content: "تم ترك التذكرة بنجاح.", ephemeral: true });
        }

        if (customId === 'ticket_options') {
            if (!member.roles.cache.has(ROLES.STAFF) && member.id !== activeTickets.get(channel.id)?.userId) {
                return interaction.reply({ content: "ليس لديك صلاحية لاستخدام هذه الخيارات ❌", ephemeral: true });
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('opt_rename_menu').setLabel('تغيير اسم التذكرة 🎟').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('opt_warn').setLabel('تنبيه العضو ⚠️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('opt_summon').setLabel('استدعاء الإداري ☑️').setStyle(ButtonStyle.Success)
            );
            return interaction.reply({ content
