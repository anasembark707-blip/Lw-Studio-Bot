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

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('WL Studio Bot is active and running! 🚀');
});

app.listen(PORT, () => {
    console.log(`Web server is listening on port ${PORT}`);
});

const dbPath = path.join(__dirname, 'database.json');

// الأيدي الثابتة
const ROLES = {
    STAFF: "1557096881140535469",     // فريق الإدارة
    BAN_TEAM: "1557095186935455755", // مسؤولين الباند
    SUPPORT: "1557095817427558420",  // مسؤولين الدعم الفني
    COMPENSATION: "1545853973922058281" // مسؤولين التعويض
};

const CHANNELS = {
    LOG: "1550972645976309781",       // روم لوق تكتات
    CATEGORY: "1550992320835362846"   // كاتجوري تكتات تفعيل
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
const renameCooldowns = new Map(); // تايمر نصف دقيقة لتغيير الأسماء

client.once('ready', async () => {
    console.log(`تم تسجيل الدخول بنجاح باسم ${client.user.tag}! البوت WL Studio Bot جاهز تماماً.`);

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
            .setDescription('تصفير نقاط الفريق الإداري للتذاكر')
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
        const { commandName, member, guild, channel } = interaction;

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

            await channel.send({ embeds: [embed], components: [row] });
            return interaction.editReply({ content: "تم إرسال بنر التذاكر بنجاح! ✅" });
        }

        if (commandName === 'pointict') {
            const config = getGuildConfig(guild.id);
            const pointsObj = config.points || {};
            const sortedPoints = Object.entries(pointsObj).sort((a, b) => b[1] - a[1]);
            
            let desc = sortedPoints.length > 0 
                ? sortedPoints.map(([id, pts], index) => `${index + 1} <@${id}> : ${pts}`).join('\n') 
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

    // إظهار الأسئلة الأربعة الإجبارية عبر Modal
    if (interaction.isButton() && ['open_support', 'open_ban', 'open_comp'].includes(interaction.customId)) {
        const existingTicket = [...activeTickets.values()].find(t => t.userId === interaction.user.id && t.guildId === interaction.guild.id);
        if (existingTicket) {
            return interaction.reply({ content: "عذراً، لديك تذكرة مفتوحة مسبقاً! ❌", ephemeral: true });
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

    // استقبال الإجابات الأربعة وإنشاء التذكرة
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
            { id: ROLES.STAFF, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory], deny: [PermissionsBitField.Flags.SendMessages] },
            { id: ROLES.BAN_TEAM, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory], deny: [PermissionsBitField.Flags.SendMessages] },
            { id: ROLES.SUPPORT, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory], deny: [PermissionsBitField.Flags.SendMessages] },
            { id: ROLES.COMPENSATION, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory], deny: [PermissionsBitField.Flags.SendMessages] }
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
            new ButtonBuilder().setCustomId('ticket_options').setLabel('خيارات التذكرة ⚙️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التذكرة ❌️').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('استلام التذكرة ✅️️').setStyle(ButtonStyle.Success)
        );

        await ticketChannel.send({ 
            content: `<@&${ROLES.STAFF}> | <@${interaction.user.id}>`, 
            embeds: [embed], 
            components: [row] 
        });

        activeTickets.set(ticketChannel.id, {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            ticketTypeName: ticketType,
            claimedBy: null,
            createdAt: Math.floor(Date.now() / 1000),
            timer: null
        });

        return interaction.editReply({ content: `تم فتح تذكرتك بنجاح هنا: <#${ticketChannel.id}> 🎟` });
    }

    if (!interaction.isButton() && !interaction.isModalSubmit()) return;

    // فحص التايمر (30 ثانية لتغيير الأسامي)
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

        // استلام التذكرة
        if (customId === 'claim_ticket') {
            if (!member.roles.cache.has(ROLES.STAFF)) {
                return interaction.reply({ content: "هذا الزر خاص بفريق الإدارة فقط! ❌", ephemeral: true });
            }
            const ticketData = activeTickets.get(channel.id);
            if (ticketData && ticketData.claimedBy) {
                return interaction.reply({ content: `تم استلام هذه التذكرة مسبقاً بواسطة <@${ticketData.claimedBy}>! ⚠️`, ephemeral: true });
            }

            if (ticketData) ticketData.claimedBy = user.id;

            await channel.permissionOverwrites.edit(ROLES.STAFF, { SendMessages: true, ViewChannel: true }).catch(() => {});
            await channel.permissionOverwrites.edit(user.id, { SendMessages: true, ViewChannel: true, ReadMessageHistory: true }).catch(() => {});

            const pointsObj = config.points || {};
            pointsObj[user.id] = (pointsObj[user.id] || 0) + 1;
            config.points = pointsObj;
            saveGuildConfig(guild.id, config);

            await channel.send({ 
                content: `تم استلاستبدال الاستلام <@${user.id}> !\n` +
                         `أيدي الإداري [\`\`\` ${user.id} \`\`\`] 👤\n` +
                         `يوزر الاداري المستلم [\`\`\` ${user.username} \`\`\`] 🧰\n` +
                         `تم منح اليك نقطة ➕️ 1\n` +
                         `عدد نقاطك = ${pointsObj[user.id]} 📊` 
            });

            return interaction.reply({ content: "تم الاستلام بنجاح.", ephemeral: true });
        }

        // خيارات التذكرة ⚙️
        if (customId === 'ticket_options') {
            if (!member.roles.cache.has(ROLES.STAFF) && member.id !== activeTickets.get(channel.id)?.userId) {
                return interaction.reply({ content: "ليس لديك صلاحية لاستخدام هذه الخيارات ❌", ephemeral: true });
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('opt_rename_menu').setLabel('تغيير اسم التذكرة 🎟').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('opt_warn').setLabel('تنبيه العضو ⚠️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('opt_summon').setLabel('استدعاء الاداري ☑️').setStyle(ButtonStyle.Success)
            );
            return interaction.reply({ content: "خيارات التذكرة المتاحة ⚙️:", components: [row], ephemeral: true });
        }

        // قائمة تغيير اسم التذكرة
        if (customId === 'opt_rename_menu') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('req_ban').setLabel('طلب مسؤولين الباند 🔺️').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('req_comp').setLabel('طلب مسؤولين التعويض 🗂').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('req_support').setLabel('طلب مسؤولين الدعم الفني 👤').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('custom_rename_prompt').setLabel('تغير اسم التذكرة 🎫').setStyle(ButtonStyle.Success)
            );
            return interaction.reply({ content: "تغيير اسم التذكرة 🎟\nاختر أحد الخيارات أدناه:", components: [row], ephemeral: true });
        }

        // طلب مسؤولين الباند / التعويض / الدعم الفني (تغيير اسم التذكرة + المنشن)
        if (['req_ban', 'req_comp', 'req_support'].includes(customId)) {
            const timeLeft = checkCooldown(user.id);
            if (timeLeft > 0) {
                return interaction.reply({ content: `عذراً، يجب عليك الانتظار ${timeLeft} ثانية قبل تغيير اسم التذكرة مرة أخرى! ⏳`, ephemeral: true });
            }

            let roleId = ROLES.SUPPORT;
            let roleName = "مسؤولين الدعم الفني";
            let newChannelName = "support-request";
            
            if (customId === 'req_ban') { 
                roleId = ROLES.BAN_TEAM; 
                roleName = "مطلوب مسؤولين الباند"; 
                newChannelName = "ban-request";
            }
            if (customId === 'req_comp') { 
                roleId = ROLES.COMPENSATION; 
                roleName = "مطلوب مسؤولين التعويض"; 
                newChannelName = "comp-request";
            }
            if (customId === 'req_support') {
                roleName = "مطلوب مسؤولين الدعم الفني";
                newChannelName = "support-request";
            }

            renameCooldowns.set(user.id, Date.now());
            await channel.setName(newChannelName).catch(() => {});
            await channel.send(`مطلوب <@&${roleId}>\nالرجاء الانتظار 🤍.`);
            return interaction.reply({ content: `تم تغيير اسم التذكرة وإرسال الطلب إلى ${roleName} بنجاح! ✅`, ephemeral: true });
        }

        // نافذة إدخال اسم تذكرة مخصص للإداري
        if (customId === 'custom_rename_prompt') {
            const timeLeft = checkCooldown(user.id);
            if (timeLeft > 0) {
                return interaction.reply({ content: `عذراً، يجب عليك الانتظار ${timeLeft} ثانية قبل تغيير اسم التذكرة مرة أخرى! ⏳`, ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('custom_rename_modal')
                .setTitle('تغيير اسم التذكرة المخصص 🎫');

            const nameInput = new TextInputBuilder()
                .setCustomId('new_ticket_name')
                .setLabel('اكتب اسم التذكرة الجديد')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
            return interaction.showModal(modal);
        }

        // تنبيه العضو
        if (customId === 'opt_warn') {
            if (!member.roles.cache.has(ROLES.STAFF)) {
                return interaction.reply({ content: "هذا الزر لفريق الإدارة فقط! ❌", ephemeral: true });
            }
            const ticketData = activeTickets.get(channel.id);
            if (!ticketData) return;

            await channel.send(
                `تم تفعيل وضع التنبيه ⚠️\n` +
                `لـ العضو <@${ticketData.userId}>\n` +
                `اذا لم يتم الرد في ٥ دقائق سيتم إغلاق التذكرة تلقائي.`
            );

            const timer = setTimeout(async () => {
                activeTickets.delete(channel.id);
                await channel.send("انتهت المدة ولم يرد العضو، سيتم حذف التذكرة.");
                setTimeout(() => channel.delete().catch(() => {}), 3000);
            }, 5 * 60 * 1000);

            ticketData.timer = timer;
            return interaction.reply({ content: "تم تفعيل التنبيه بنجاح.", ephemeral: true });
        }

        // استدعاء الإداري
        if (customId === 'opt_summon') {
            const ticketData = activeTickets.get(channel.id);
            if (ticketData && ticketData.claimedBy) {
                await channel.send(`تم استدعاء الاداري ☑️️ <@${ticketData.claimedBy}>`);
            } else {
                await channel.send(`تم استدعاء الاداري ☑️ <@&${ROLES.STAFF}>`);
            }
            return interaction.reply({ content: "تم الاستدعاء بنجاح.", ephemeral: true });
        }

        // إغلاق التذكرة
        if (customId === 'close_ticket') {
            if (!member.roles.cache.has(ROLES.STAFF)) {
                return interaction.reply({ content: "هذا الزر لفريق الإدارة فقط! ❌", ephemeral: true });
            }
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('delete_ticket').setLabel('حذف التذكرة 🗑').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('leave_ticket').setLabel('ترك التذكرة 🚫').setStyle(ButtonStyle.Secondary)
            );
            return interaction.reply({ content: "اختر إجراء الإغلاق:", components: [row], ephemeral: true });
        }

        // ترك التذكرة
        if (customId === 'leave_ticket') {
            const ticketData = activeTickets.get(channel.id);
            if (ticketData && ticketData.claimedBy === user.id) {
                const oldClaimer = ticketData.claimedBy;
                ticketData.claimedBy = null;

                const pointsObj = config.points || {};
                pointsObj[user.id] = Math.max(0, (pointsObj[user.id] || 1) - 1);
                config.points = pointsObj;
                saveGuildConfig(guild.id, config);

                await channel.permissionOverwrites.edit(ROLES.STAFF, { SendMessages: false, ViewChannel: true }).catch(() => {});
                await channel.permissionOverwrites.delete(user.id).catch(() => {});

                await channel.send(`ترك الإداري المستلم <@${oldClaimer}> التذكرة وتم خصم منك نقطة 1 📉`);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('claim_ticket').setLabel('استلام التذكرة ✅️').setStyle(ButtonStyle.Success)
                );
                await channel.send({ content: `<@&${ROLES.STAFF}>\nالرجاء الإستلام`, components: [row] });
            }
            return interaction.reply({ content: "تم ترك التذكرة بنجاح.", ephemeral: true });
        }

        // حذف التذكرة
        if (customId === 'delete_ticket') {
            const ticketData = activeTickets.get(channel.id);
            await channel.send("سيتم حذف التذكرة...");

            if (CHANNELS.LOG) {
                const logChan = guild.channels.cache.get(CHANNELS.LOG);
                if (logChan) {
                    const closedAt = Math.floor(Date.now() / 1000);
                    const logEmbed = new EmbedBuilder()
                        .setColor(0xED4245)
                        .setTitle(`تذكرة رقم ${config.ticketCounter}`)
                        .setDescription(
                            `**اسم التذكرة:** \`${channel.name}\`\n` +
                            `**عضو التذكرة:** <@${ticketData ? ticketData.userId : 'غير معروف'}> | \`${ticketData ? ticketData.userId : ''}\`\n` +
                            `**مستلم التذكرة:** ${ticketData && ticketData.claimedBy ? `<@${ticketData.claimedBy}> | \`${ticketData.claimedBy}\`` : 'لم يتم الاستلام'}\n` +
                            `**حذفت بواسطة:** <@${user.id}> | \`${user.username}\`\n` +
                            `**وقت فتح التذكرة:** <t:${ticketData ? ticketData.createdAt : closedAt}:F>\n` +
                            `**وقت إغلاق التذكرة:** <t:${closedAt}:F>`
                        );
                    await logChan.send({ embeds: [logEmbed] });
                }
            }

            activeTickets.delete(channel.id);
            setTimeout(() => channel.delete().catch(() => {}), 3000);
            return interaction.reply({ content: "جاري الحذف...", ephemeral: true });
        }
    }

    // استقبال الاسم المخصص من النافذة وتطبيق التايمر عليه
    if (interaction.isModalSubmit() && interaction.customId === 'custom_rename_modal') {
        const timeLeft = checkCooldown(interaction.user.id);
        if (timeLeft > 0) {
            return interaction.reply({ content: `عذراً، يجب عليك الانتظار ${timeLeft} ثانية قبل تغيير اسم التذكرة مرة أخرى! ⏳`, ephemeral: true });
        }

        const newName = interaction.fields.getTextInputValue('new_ticket_name');
        renameCooldowns.set(interaction.user.id, Date.now());

        await interaction.channel.setName(newName).catch(() => {});
        return interaction.reply({ content: `تم تغيير اسم التذكرة إلى: **${newName}** بنجاح! ✅`, ephemeral: true });
    }
});

const token = process.env.DISCORD_TOKEN;
client.login(token);
